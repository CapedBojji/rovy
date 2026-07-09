const assert = require("node:assert/strict");
const { assertNoDiagnostics, compileFixture } = require("./helpers");

function runCase(name, fn) {
	try {
		fn();
		console.log(`ok  ${name}`);
	} catch (error) {
		console.error(`not ok  ${name}`);
		throw error;
	}
}

const header = `
import {
	Commands,
	Entity,
	EventReader,
	EventWriter,
	Local,
	OptRes,
	Prefab,
	Pair,
	Query,
	Res,
	ResMut,
	Trait,
	HasPair,
	With,
	Without,
	Added,
	Changed,
	Removed,
	World,
	Collector,
	$collectRef,
	component,
	collect,
	inspect,
	event,
	monitor,
	observer,
	prefab,
	query,
	resource,
	relation,
	rovy,
	schedule,
	server,
	client,
	system,
	trait,
	plugin,
} from "@rovy/core";
	import {
		NetClient,
		NetEventContext,
		NetId,
		NetFunctionReader,
		NetFunctionResponder,
		NetFunc,
	NetServer,
	netEvent,
	netFunction,
		rovyNet,
	} from "@rovy/networking";
	import {
		DocumentChanged,
		DocumentOpened,
		DocumentOpener,
		DocumentReader,
		DocumentWriter,
		playerDocument,
		rovyData,
	} from "@rovy/datastore";
	import RovyUi, { Style, StyleScope, button, scope, useEffect, useInstance, useState } from "@rovy/imgui";
	import RetainedUi, {
		$componentTrigger,
		$eventTrigger,
		$prop,
		$queryTrigger,
		$resourceTrigger,
		Props,
		UiChildren,
		child,
		fragment,
		frame,
		textLabel,
		ui,
	} from "@rovy/ui";
	import { ViewContext, ViewMonitor, view, rovyVide } from "@rovy/vide";
	`;

runCase("bare decorators inject registry calls", () => {
	const result = compileFixture(`
${header}
@component class Unit {}
@collect class FireInbox extends Collector<unknown> {}
@resource class Clock { constructor(public tick = 0) {} }
@event({ capacity: 8 }) class DamageTaken {}
@relation({ exclusive: true }) class ChildOf {}
@schedule({ runOnStart: true }) class Update {}
`);
	assertNoDiagnostics(result, "decorator injection");
	assert.match(result.printed, /__component\(Unit,/);
	assert.match(result.printed, /__collect\(FireInbox,/);
	assert.match(result.printed, /__resource\(Clock,/);
	assert.match(result.printed, /__event\(DamageTaken,/);
	assert.match(result.printed, /__relation\(ChildOf,/);
	assert.match(result.printed, /__schedule\(Update,/);
});

runCase("component editor metadata defaults runtime type checks off", () => {
	const result = compileFixture(`
${header}
@component class ModelRef {
	constructor(public rootPart: BasePart) {}
}
`);
	assertNoDiagnostics(result, "component editor metadata default");
	assert.match(result.printed, /editor: \{ fields: \[ \{ key: "rootPart", typeLabel: "BasePart", validator: \(value: unknown\): value is unknown => true \} \]/);
	assert.match(result.printed, /constructorValidator: \(value: unknown\): value is unknown => true/);
	assert.doesNotMatch(result.printed, /@rbxts\/t/);
});

runCase(".rovy.json editor.runtimeTypeChecks enables generated t validators", () => {
	const result = compileFixture(
		`
${header}
@component class ModelRef {
	constructor(public rootPart: BasePart) {}
}
`,
		{
			rovyConfig: {
				current: "dev",
				environments: {
					dev: {
						editor: {
							runtimeTypeChecks: true,
						},
					},
				},
			},
		},
	);
	assertNoDiagnostics(result, "component editor metadata enabled");
	assert.match(result.printed, /from "@rbxts\/t"/);
	assert.match(result.printed, /validator: .*\.instanceIsA\("BasePart"\)/);
	assert.match(result.printed, /constructorValidator: .*\.strictArray\(.*\.instanceIsA\("BasePart"\)\)/);
});

runCase(".rovy.json debug enables runtime type checks when editor flag omitted", () => {
	const result = compileFixture(
		`
${header}
@component class Named {
	constructor(public name: string) {}
}
`,
		{
			rovyConfig: {
				current: "dev",
				environments: {
					dev: {
						debug: true,
					},
				},
			},
		},
	);
	assertNoDiagnostics(result, "debug runtime type checks");
	assert.match(result.printed, /from "@rbxts\/t"/);
	assert.match(result.printed, /validator: .*\.string/);
	assert.match(result.printed, /constructorValidator: .*\.strictArray\(.*\.string\)/);
});

runCase("package rovy-build config takes precedence over .rovy.json", () => {
	const result = compileFixture(
		`
${header}
@component class Named {
	constructor(public name: string) {}
}
`,
		{
			rovyConfig: {
				current: "dev",
				environments: {
					dev: {
						debug: false,
					},
				},
			},
			packageRovyBuild: {
				current: "dev",
				environments: {
					dev: {
						debug: true,
					},
				},
			},
		},
	);
	assertNoDiagnostics(result, "package rovy-build config");
	assert.match(result.printed, /from "@rbxts\/t"/);
	assert.match(result.printed, /validator: .*\.string/);
});

runCase("tsconfig transformer runtimeTypeChecks option overrides .rovy.json", () => {
	const result = compileFixture(
		`
${header}
@component class ModelRef {
	constructor(public rootPart: BasePart) {}
}
`,
		{
			rovyConfig: {
				current: "dev",
				environments: {
					dev: {
						editor: {
							runtimeTypeChecks: true,
						},
					},
				},
			},
			config: {
				runtimeTypeChecks: false,
			},
		},
	);
	assertNoDiagnostics(result, "runtime type checks override");
	assert.match(result.printed, /validator: \(value: unknown\): value is unknown => true/);
	assert.doesNotMatch(result.printed, /@rbxts\/t/);
});

runCase("@plugin emits plugin registration and owned metadata in same file", () => {
	const result = compileFixture(`
${header}
@plugin export class CombatPlugin {
	build() {}
}
@schedule class Update {}
@resource class Clock { tick = 0; }
@system({ schedule: Update })
class TickClock {
	run() {}
}
`);
	assertNoDiagnostics(result, "plugin ownership");
	assert.match(result.printed, /__plugin\(CombatPlugin, \{ id: "src\/main", root: "src\/main" \}\)/);
	assert.match(result.printed, /__resource\(Clock, "src\/main@Clock"/);
	assert.match(result.printed, /plugin: CombatPlugin/);
	assert.match(result.printed, /__system\(TickClock, \{ id: "src\/main@TickClock", plugin: CombatPlugin, schedule: Update/);
});

runCase("index.ts plugins own child modules and nearest index root wins", () => {
	const files = {
		"plugins/outer/index.ts": `
${header}
@plugin export class OuterPlugin {
	build() {}
}
`,
		"plugins/outer/systems/outer.ts": `
${header}
import { Update } from "../update";
@system({ schedule: Update })
class OuterSystem { run() {} }
`,
		"plugins/outer/update.ts": `
${header}
@schedule export class Update {}
`,
		"plugins/outer/nested/index.ts": `
${header}
@plugin export class InnerPlugin {
	build() {}
}
`,
		"plugins/outer/nested/systems/inner.ts": `
${header}
import { Update } from "../../update";
@system({ schedule: Update })
class InnerSystem { run() {} }
`,
	};
	const outer = compileFixture(files["plugins/outer/systems/outer.ts"], {
		files,
		fileName: "plugins/outer/systems/outer.ts",
	});
	assertNoDiagnostics(outer, "outer index plugin child");
	assert.match(outer.printed, /from "\.\.\/index"/);
	assert.match(outer.printed, /id: "systems\/outer@OuterSystem"/);
	assert.match(outer.printed, /plugin: OuterPlugin/);

	const inner = compileFixture(files["plugins/outer/nested/systems/inner.ts"], {
		files,
		fileName: "plugins/outer/nested/systems/inner.ts",
	});
	assertNoDiagnostics(inner, "inner index plugin child");
	assert.match(inner.printed, /from "\.\.\/index"/);
	assert.match(inner.printed, /id: "systems\/inner@InnerSystem"/);
	assert.match(inner.printed, /plugin: InnerPlugin/);
});

runCase("non-index plugins do not own child modules", () => {
	const files = {
		"plugins/solo/plugin.ts": `
${header}
@plugin export class SoloPlugin {
	build() {}
}
`,
		"plugins/solo/update.ts": `
${header}
@schedule export class Update {}
`,
		"plugins/solo/systems/child.ts": `
${header}
import { Update } from "../update";
@system({ schedule: Update })
class ChildSystem { run() {} }
`,
	};
	const child = compileFixture(files["plugins/solo/systems/child.ts"], {
		files,
		fileName: "plugins/solo/systems/child.ts",
	});
	assertNoDiagnostics(child, "non-index plugin child");
	assert.doesNotMatch(child.printed, /plugin: SoloPlugin/);
	assert.doesNotMatch(child.printed, /from "\.\.\/plugin"/);
	assert.match(child.printed, /id: "src\/plugins\/solo\/systems\/child@ChildSystem"/);
});

runCase("netEvent injects core event and networking metadata", () => {
	const result = compileFixture(`
${header}
@netEvent({ direction: "clientToServer", channel: "reliable", receive: "send" })
class CastAbilityIntent {
	constructor(
		public caster: NetId,
		public abilityId: string,
		public target?: NetId,
	) {}
}
`);
	assertNoDiagnostics(result, "netEvent lowering");
	assert.match(result.printed, /__event\(CastAbilityIntent\)/);
	assert.match(result.printed, /rovyNet\.__netEvent\(CastAbilityIntent,/);
	assert.match(result.printed, /direction: "clientToServer"/);
	assert.match(result.printed, /channel: "reliable"/);
	assert.match(result.printed, /receive: "send"/);
	assert.match(result.printed, /event CastAbilityIntent/);
	assert.match(result.printed, /caster: u32/);
	assert.match(result.printed, /abilityId: string/);
	assert.match(result.printed, /target: u32\?/);
});

runCase("networking params lower as external package params", () => {
	const result = compileFixture(
		`
${header}
@schedule class Update {}
@netEvent({ direction: "serverToClient", channel: "unreliable", receive: "trigger" })
class PlayHitEffect {
	constructor(public target: NetId, public effectId: string) {}
}
@system({ schedule: Update })
class SendEffects {
	run(server: NetServer, client: NetClient, context: NetEventContext) {}
}
`,
		{
			rovyConfig: {
				current: "dev",
				environments: {
					dev: {
						rojo: "test.project.json",
						net: {
							strictBoundaryChecks: false,
						},
					},
				},
			},
		},
	);
	assertNoDiagnostics(result, "net params");
	assert.match(result.printed, /kind: "external", id: "@rovy\/networking\/NetServer"/);
	assert.match(result.printed, /kind: "external", id: "@rovy\/networking\/NetClient"/);
	assert.match(result.printed, /kind: "external", id: "@rovy\/networking\/NetEventContext"/);
	assert.match(result.printed, /From: Server/);
	assert.match(result.printed, /Type: Unreliable/);
});

runCase("netFunction injects metadata and function params", () => {
	const result = compileFixture(
		`
${header}
class FetchProfileResult {
	constructor(public displayName: string, public coins: number) {}
}
@netFunction({ direction: "clientToServer", result: FetchProfileResult })
class FetchProfile {
	constructor(public userId: NetId, public key: string) {}
}
@schedule class Update {}
@system({ schedule: Update })
class SendFetch {
	run(fetchProfile: NetFunc<FetchProfile, FetchProfileResult>, local: Local<{ result?: unknown }>) {
		const handle = fetchProfile.call(new FetchProfile(1, "coins"));
		const result = fetchProfile.getResult(handle);
		if (result !== undefined && !("ok" in result)) local.result = result.coins;
	}
}
@system({ schedule: Update })
class HandleFetch {
	run(reader: NetFunctionReader<FetchProfile>, responder: NetFunctionResponder) {}
}
`,
		{
			rovyConfig: {
				current: "dev",
				environments: {
					dev: {
						rojo: "test.project.json",
						net: {
							strictBoundaryChecks: false,
						},
					},
				},
			},
		},
	);
	assertNoDiagnostics(result, "netFunction lowering");
	assert.match(result.printed, /rovyNet\.__netFunction\(FetchProfile,/);
	assert.match(result.printed, /result: FetchProfileResult/);
	assert.match(result.printed, /fields: \["userId", "key"\]/);
	assert.match(result.printed, /resultFields: \["displayName", "coins"\]/);
	assert.match(result.printed, /event FetchProfileRequest/);
	assert.match(result.printed, /event FetchProfileResult/);
	assert.match(result.printed, /const handle = fetchProfile\.call\(new FetchProfile\(1, "coins"\), "src\/main:0"\)/);
	assert.match(result.printed, /const result = fetchProfile\.getResult\(handle\)/);
	assert.match(result.printed, /local\.result = result\.coins/);
	assert.match(result.printed, /kind: "external", id: "@rovy\/networking\/NetFunc:src\/main@FetchProfile"/);
	assert.match(result.printed, /kind: "external", id: "@rovy\/networking\/NetFunctionReader:src\/main@FetchProfile"/);
	assert.match(result.printed, /kind: "external", id: "@rovy\/networking\/NetFunctionResponder"/);
});

runCase("netFunction validates v1 client-to-server only", () => {
	const result = compileFixture(`
${header}
class Result {}
@netFunction({ direction: "serverToClient", result: Result })
class BadRequest {}
`);
	assert.match(result.diagnostics.join("\n"), /@netFunction direction must be one of: "clientToServer"/);
});

runCase("networking files emit runtime config from .rovy.json", () => {
	const result = compileFixture(
		`
${header}
@schedule class Update {}
@system({ schedule: Update })
class SendEffects {
	run(_client: NetClient) {}
}
`,
		{
			rovyConfig: {
				current: "dev",
				environments: {
					dev: {
						rojo: "test.project.json",
						net: {
							transport: "remote",
							strictBoundaryChecks: false,
						},
					},
				},
			},
		},
	);
	assertNoDiagnostics(result, "runtime config");
	assert.match(result.printed, /rovyNet\.__configureRuntime\(\{ transport: "remote", strictBoundaryChecks: false \}\)/);
});

runCase("boundary checks use .rovy.json paths for NetServer", () => {
	const result = compileFixture(
		`
${header}
@schedule class Update {}
@system({ schedule: Update })
class SendEffects {
	run(_server: NetServer) {}
}
`,
		{
			fileName: "client/main.ts",
			rovyConfig: {
				current: "dev",
				environments: {
					dev: {
						rojo: "test.project.json",
						boundaries: {
							client: ["src/client"],
							server: ["src/server"],
							shared: ["src/shared"],
						},
						net: {
							strictBoundaryChecks: true,
						},
					},
				},
			},
		},
	);
	assert.match(result.diagnostics.join("\n"), /NetServer can only be injected from the server boundary/);
});

runCase("boundary checks use .rovy.json paths for NetClient", () => {
	const result = compileFixture(
		`
${header}
@schedule class Update {}
@system({ schedule: Update })
class SendEffects {
	run(_client: NetClient) {}
}
`,
		{
			fileName: "server/main.ts",
			rovyConfig: {
				current: "dev",
				environments: {
					dev: {
						rojo: "test.project.json",
						boundaries: {
							client: ["src/client"],
							server: ["src/server"],
							shared: ["src/shared"],
						},
						net: {
							strictBoundaryChecks: true,
						},
					},
				},
			},
		},
	);
	assert.match(result.diagnostics.join("\n"), /NetClient can only be injected from the client boundary/);
});

runCase("netEvent rejects duplicate event decorator", () => {
	const result = compileFixture(`
${header}
@event()
@netEvent({ direction: "clientToServer" })
class DuplicateEvent {}
`);
	assert.match(result.diagnostics.join("\n"), /@netEvent implies @event/);
});

runCase("$collectRef resource fields lower into resource metadata", () => {
	const result = compileFixture(`
${header}
@collect class FireInbox extends Collector<unknown> {}
@resource class InboxRefs {
	readonly inbox = $collectRef<FireInbox>();
}
`);
	assertNoDiagnostics(result, "$collectRef lowering");
	assert.match(result.printed, /__resource\(InboxRefs, "src\/main@InboxRefs", \{[\s\S]*collectorRefs: \[\s*\{ key: "inbox", ctor: FireInbox \}\s*\]/);
	assert.match(result.printed, /inbox = undefined as unknown as FireInbox/);
	assert.doesNotMatch(result.printed, /\$collectRef<FireInbox>\(\)/);
});

runCase("@inspect resource emits debug metadata for public data fields", () => {
	const result = compileFixture(
		`
${header}
@inspect
@resource
class DebugState {
	public tick = 0;
	name = "ready";
	readonly alive: boolean = true;
	private secret = 1;
	protected hidden = 2;
	static shared = 3;
	callback: () => void = () => {};
	method() {}
}
`,
		{
			packageRovyBuild: {
				current: "dev",
				environments: {
					dev: { debug: true },
				},
			},
		},
	);
	assertNoDiagnostics(result, "inspect resource metadata");
	assert.match(result.printed, /__resource\(DebugState, "src\/main@DebugState", \{ inspect: \{ fields: \[/);
	assert.match(result.printed, /\{ key: "tick", typeLabel: "number", validator: \(value: unknown\): value is unknown => true \}/);
	assert.match(result.printed, /\{ key: "name", typeLabel: "string", validator: \(value: unknown\): value is unknown => true \}/);
	assert.match(result.printed, /\{ key: "alive", typeLabel: "boolean", validator: .*\.boolean \}/);
	assert.doesNotMatch(result.printed, /key: "secret"/);
	assert.doesNotMatch(result.printed, /key: "hidden"/);
	assert.doesNotMatch(result.printed, /key: "shared"/);
	assert.doesNotMatch(result.printed, /key: "callback"/);
	// @inspect is a soft-deprecated no-op: metadata flows through __resource, never __inspect.
	assert.doesNotMatch(result.printed, /__inspect\(/);
});

runCase("@resource without @inspect emits debug metadata", () => {
	const result = compileFixture(
		`
${header}
@resource
class DebugState {
	public tick = 0;
	name = "ready";
	private secret = 1;
}
`,
		{
			packageRovyBuild: {
				current: "dev",
				environments: {
					dev: { debug: true },
				},
			},
		},
	);
	assertNoDiagnostics(result, "resource metadata without inspect");
	assert.match(result.printed, /__resource\(DebugState, "src\/main@DebugState", \{ inspect: \{ fields: \[/);
	assert.match(result.printed, /\{ key: "tick", typeLabel: "number", validator: \(value: unknown\): value is unknown => true \}/);
	assert.match(result.printed, /\{ key: "name", typeLabel: "string", validator: \(value: unknown\): value is unknown => true \}/);
	assert.doesNotMatch(result.printed, /key: "secret"/);
	assert.doesNotMatch(result.printed, /__inspect\(/);
});

runCase("@inspect on resource compiles identically to no decorator", () => {
	const build = {
		packageRovyBuild: {
			current: "dev",
			environments: { dev: { debug: true } },
		},
	};
	const withInspect = compileFixture(
		`
${header}
@inspect
@resource
class DebugState {
	tick = 0;
}
`,
		build,
	);
	const without = compileFixture(
		`
${header}
@resource
class DebugState {
	tick = 0;
}
`,
		build,
	);
	assertNoDiagnostics(withInspect, "with @inspect");
	assertNoDiagnostics(without, "without @inspect");
	assert.equal(withInspect.printed, without.printed);
});

runCase("@inspect resource emits diagnostic for unsupported field names", () => {
	const result = compileFixture(
		`
${header}
const dynamicKey = "computed-name";
@inspect
@resource
class DebugState {
	[dynamicKey] = 1;
}
`,
		{
			packageRovyBuild: {
				current: "dev",
				environments: {
					dev: { debug: true },
				},
			},
		},
	);
	assert.match(result.diagnostics.join("\n"), /must use an identifier, string, or number property name/);
});

runCase("@inspect resource strips metadata when debug is false", () => {
	const result = compileFixture(
		`
${header}
@inspect
@resource
class DebugState {
	tick = 0;
}
`,
		{
			packageRovyBuild: {
				current: "prod",
				environments: {
					prod: { debug: false },
				},
			},
		},
	);
	assertNoDiagnostics(result, "inspect stripped");
	assert.match(result.printed, /__resource\(DebugState, "src\/main@DebugState"\)/);
	assert.doesNotMatch(result.printed, /inspect:/);
});

runCase("@inspect resource strips metadata with no debug environment", () => {
	const result = compileFixture(`
${header}
@inspect
@resource
class DebugState {
	tick = 0;
}
`);
	assertNoDiagnostics(result, "inspect default stripped");
	assert.match(result.printed, /__resource\(DebugState, "src\/main@DebugState"\)/);
	assert.doesNotMatch(result.printed, /inspect:/);
});

runCase("@inspect rejects non-resource classes", () => {
	const result = compileFixture(`
${header}
@inspect
@component
class BadInspect {}
`);
	assert.match(result.diagnostics.join("\n"), /@inspect can only be used on @resource classes/);
});

runCase("JSDoc widget functions register and plain calls lower", () => {
	const result = compileFixture(`
${header}
/** @widget */
export function Window(options: { title: string }): void {
	print(options.title);
}

export function draw() {
	Window({ title: "Inventory" });
}
`);
	assertNoDiagnostics(result, "widget lowering");
	assert.match(result.printed, /const __rovyWidgetMeta_Window = \{/);
	assert.match(result.printed, /id: "src\/main@Window"/);
	assert.match(result.printed, /name: "Window"/);
	assert.doesNotMatch(result.printed, /params:/);
	assert.match(result.printed, /const Window = RovyUi\.__widget\(function /);
	assert.match(result.printed, /__rovyWidgetMeta_Window\)/);
	assert.match(result.printed, /RovyUi\.__scope\("src\/main:0", \(\) => Window\(\{ title: "Inventory" \}\)\)/);
});

runCase("JSDoc widget functions can use overloads for clean call signatures", () => {
	const result = compileFixture(`
${header}

/** @widget */
export function Window(options: { title: string }): void;
export function Window(options?: { title: string }): void {
	if (options) print(options.title);
}

export function draw() {
	Window({ title: "Inventory" });
}
`);
	assertNoDiagnostics(result, "widget overload lowering");
	assert.match(result.printed, /const __rovyWidgetMeta_Window = \{/);
	assert.match(result.printed, /const Window = RovyUi\.__widget\(function /);
	assert.match(result.printed, /__rovyWidgetMeta_Window\)/);
	assert.match(result.printed, /RovyUi\.__scope\("src\/main:0", \(\) => Window\(\{ title: "Inventory" \}\)\)/);
});

runCase("widget state helpers remain public calls inside lowered widget", () => {
	const result = compileFixture(`
${header}
/** @widget */
export function Counter(): void {
	const [count, setCount] = useState(0);
	setCount(count + 1);
}
`);
	assertNoDiagnostics(result, "widget state helper");
	assert.match(result.printed, /RovyUi\.__useState\("src\/main:0", 0\)/);
	assert.match(result.printed, /const __rovyWidgetMeta_Counter = \{/);
	assert.match(result.printed, /const Counter = RovyUi\.__widget\(function /);
	assert.match(result.printed, /__rovyWidgetMeta_Counter\)/);
});

runCase("UI built-in widgets and helpers lower with compile keys", () => {
	const result = compileFixture(`
${header}
export function draw() {
	const [count] = useState(0);
	useEffect(() => {}, count);
	useInstance((ref) => new Instance("Frame"));
	scope(() => {
		button("Named");
		RovyUi.label("Namespaced");
	});
}
`);
	assertNoDiagnostics(result, "ui compile keys");
	assert.match(result.printed, /RovyUi\.__useState\("src\/main:0", 0\)/);
	assert.match(result.printed, /RovyUi\.__useEffect\("src\/main:1", \(\) => \{ \}, count\)/);
	assert.match(result.printed, /RovyUi\.__useInstance\("src\/main:2", \(ref\) => new Instance\("Frame"\)\)/);
	assert.match(result.printed, /RovyUi\.__scope\("src\/main:3", \(\) =>/);
	assert.match(result.printed, /RovyUi\.__scope\("src\/main:4", \(\) => button\("Named"\)\)/);
	assert.match(result.printed, /RovyUi\.__scope\("src\/main:5", \(\) => RovyUi\.label\("Namespaced"\)\)/);
});

runCase("widget style param lowers to active style lookup", () => {
	const result = compileFixture(`
${header}
/** @widget */
export function Label(style: Style, options: { text: string }): void {
	print(style.textColor, options.text);
}
`);
	assertNoDiagnostics(result, "widget style lowering");
	assert.match(result.printed, /function \(options: \{ text: string; \}\): void \{ const style = RovyUi\.getActiveStyle\(\); print\(style\.textColor, options\.text\); \}/);
	assert.match(result.printed, /const __rovyWidgetMeta_Label = \{/);
	assert.match(result.printed, /const Label = RovyUi\.__widget\(function /);
});

runCase("StyleScope lowers to RovyUi.withStyleScope", () => {
	const result = compileFixture(`
${header}
export function draw() {
	StyleScope({ patch: { textColor: Color3.fromRGB(255, 220, 120) }, discriminator: "rare" }, () => {
		print("inside");
	});
}
`);
	assertNoDiagnostics(result, "StyleScope lowering");
	assert.match(result.printed, /RovyUi\.__withStyleScope\("src\/main:0", \{ patch: \{ textColor: Color3\.fromRGB\(255, 220, 120\) \}, discriminator: "rare" \}, \(\) =>/);
});

runCase("widget declaration without same-file implementation emits diagnostic", () => {
	const result = compileFixture(`
${header}
/** @widget */
export function Missing(options: { title: string }): void;
`);
	assert.match(result.diagnostics.join("\n"), /@widget caller 'Missing' requires a same-file implementation/);
});

runCase("system query and injection params lower into descriptors", () => {
	const result = compileFixture(`
${header}
@schedule class Update {}
@component class Unit {}
@component class Dead {}
@component class Health {}
@resource class Clock { constructor(public tick = 0) {} }
@event() class DamageTaken {}
@system({ schedule: Update })
class TickSystem {
	run(
		commands: Commands,
		world: World,
		queryA: Query<[Entity, Health], With<Unit>, Without<Dead>, Changed<Health>, Added<Health>, Removed<Dead>>,
		clock: Res<Clock>,
		clockMut: ResMut<Clock>,
		maybeClock: OptRes<Clock>,
		reader: EventReader<DamageTaken>,
		writer: EventWriter<DamageTaken>,
		cache: Local<{ count: number }>,
	) {}
}
`);
	assertNoDiagnostics(result, "system params");
	assert.match(result.printed, /kind: "commands"/);
	assert.match(result.printed, /kind: "world"/);
	assert.match(result.printed, /kind: "query"/);
	assert.match(result.printed, /kind: "res"/);
	assert.match(result.printed, /kind: "resMut"/);
	assert.match(result.printed, /kind: "optRes"/);
	assert.match(result.printed, /kind: "eventReader"/);
	assert.match(result.printed, /kind: "eventWriter"/);
	assert.match(result.printed, /kind: "local"/);
	assert.match(result.printed, /with: \[Unit\]/);
	assert.match(result.printed, /without: \[Dead\]/);
	assert.match(result.printed, /changed: \[Health\]/);
	assert.match(result.printed, /added: \[Health\]/);
	assert.match(result.printed, /removed: \[Dead\]/);
});

runCase("datastore playerDocument lowers to rovyData document with generated validator", () => {
	const result = compileFixture(`
${header}
type ProfileData = {
	coins: number;
	selectedPet?: string;
	pets: Record<string, { level: number; xp: number }>;
};
export const PlayerProfile = playerDocument<ProfileData>()({
	name: "PlayerProfile",
	store: "PlayerData",
	default: () => ({
		coins: 0,
		pets: {},
	}),
});
`);
	assertNoDiagnostics(result, "datastore document lowering");
	assert.match(result.printed, /rovyData\.__document\(\{ id: "src\/main\/PlayerProfile", kind: "player"/);
	assert.match(result.printed, /check: .*\.interface\(\{/);
	assert.match(result.printed, /selectedPet: .*\.optional\(.*\.string\)/);
	assert.match(result.printed, /pets: .*\.map\(.*\.string, .*\.interface/);
});

runCase("datastore unsupported field type fails transformer", () => {
	const result = compileFixture(`
${header}
type ProfileData = {
	createdAt: DateTime;
};
export const PlayerProfile = playerDocument<ProfileData>()({
	name: "PlayerProfile",
	store: "PlayerData",
	default: () => ({
		createdAt: DateTime.now(),
	}),
});
`);
	assert.match(result.diagnostics.join("\n"), /Cannot generate validator for ProfileData\.createdAt: unsupported type 'DateTime'/);
});

runCase("datastore params and event wrappers lower to external ids and generated event ctor", () => {
	const result = compileFixture(`
${header}
type ProfileData = { coins: number };
export const PlayerProfile = playerDocument<ProfileData>()({
	name: "PlayerProfile",
	store: "PlayerData",
	default: () => ({ coins: 0 }),
});
@schedule class Update {}
@system({ schedule: Update })
class ProfileSystem {
	run(
		reader: DocumentReader<typeof PlayerProfile>,
		writer: DocumentWriter<typeof PlayerProfile>,
		opener: DocumentOpener<typeof PlayerProfile>,
		opened: EventReader<DocumentOpened<typeof PlayerProfile>>,
		changed: EventReader<DocumentChanged<typeof PlayerProfile>>,
	) {}
}
`);
	assertNoDiagnostics(result, "datastore params");
	assert.match(result.printed, /id: "@rovy\/datastore\/reader:src\/main\/PlayerProfile"/);
	assert.match(result.printed, /id: "@rovy\/datastore\/writer:src\/main\/PlayerProfile"/);
	assert.match(result.printed, /id: "@rovy\/datastore\/opener:src\/main\/PlayerProfile"/);
	assert.match(result.printed, /eventCtor\("opened", "src\/main\/PlayerProfile"\)/);
	assert.match(result.printed, /eventCtor\("changed", "src\/main\/PlayerProfile"\)/);
});

runCase("@server/@client guard system registration and lowered params", () => {
	const serverResult = compileFixture(`
${header}
@component class Unit {}
@schedule class Update {}
@server
@system({ schedule: Update })
class ServerSystem {
	run(units: Query<[Entity, Unit]>) {}
}
`);
	assertNoDiagnostics(serverResult, "server system guard");
	assert.match(serverResult.printed, /class ServerSystem/);
	assert.match(serverResult.printed, /if \(game\.GetService\("RunService"\)\.IsServer\(\)\) \{ rovy\.__query/);
	assert.match(serverResult.printed, /__system\(ServerSystem/);

	const clientResult = compileFixture(`
${header}
@schedule class Update {}
@client
@system({ schedule: Update })
class ClientSystem {
	run() {}
}
`);
	assertNoDiagnostics(clientResult, "client system guard");
	assert.match(clientResult.printed, /if \(game\.GetService\("RunService"\)\.IsClient\(\)\) \{ rovy\.__system\(ClientSystem/);

	const invalid = compileFixture(`
${header}
@schedule class Update {}
@server
@client
@system({ schedule: Update })
class ConfusedSystem {
	run() {}
}
`);
	assert.match(invalid.diagnostics.join("\n"), /@server and @client cannot be used on the same class/);
});

runCase("traits and pairs lower in query descriptors and trait macro rewrites", () => {
	const result = compileFixture(`
${header}
interface CrowdControl {}
@component class Stunned implements CrowdControl {}
@relation class ChildOf {}
@schedule class Update {}
@system({ schedule: Update })
class TraitSystem {
	run(queryA: Query<[Entity, Trait<CrowdControl>, Pair<ChildOf>]>) {
		const token = trait<CrowdControl>();
		print(queryA, token);
	}
}
`);
	assertNoDiagnostics(result, "traits and pairs");
	assert.match(result.printed, /__traitImpl\("src\/main", Stunned\)/);
	assert.match(result.printed, /traitToken\("src\/main"\)/);
	assert.match(result.printed, /t: "trait"/);
	assert.match(result.printed, /t: "pair"/);
});

runCase("builtin relation class tokens lower in pair and tick descriptors", () => {
	const result = compileFixture(`
${header}
import { ChildOf } from "@rovy/core";
@schedule class Update {}
@system({ schedule: Update })
class BuiltinRelationSystem {
	run(queryA: Query<[Entity, Pair<ChildOf>], HasPair<ChildOf>, Changed<ChildOf>, Added<ChildOf>, Removed<ChildOf>>) {}
}
`);
	assertNoDiagnostics(result, "builtin relation descriptors");
	assert.match(result.printed, /t: "pair"/);
	assert.match(result.printed, /relation: ChildOf/);
	assert.match(result.printed, /hasPair: \[ChildOf\]/);
	assert.match(result.printed, /changed: \[ChildOf\]/);
	assert.match(result.printed, /added: \[ChildOf\]/);
	assert.match(result.printed, /removed: \[ChildOf\]/);
});

runCase("monitor match query and term params lower separately", () => {
	const result = compileFixture(`
${header}
@component class Unit {}
@component class Health {}
@schedule class Update {}
@monitor({ match: query<[Entity, Health], With<Unit>>() })
class HealthMonitor {
	onEnter(entity: Entity, health: Health, commands: Commands) {}
}
	`);
	assertNoDiagnostics(result, "monitor lowering");
	assert.match(result.printed, /__query\(\{ id: "src\/main@HealthMonitor:match"/);
	assert.match(result.printed, /__monitor\(HealthMonitor, \{ match: "src\/main@HealthMonitor:match"/);
	assert.match(result.printed, /kind: "entity"/);
	assert.match(result.printed, /kind: "term", index: 1/);
	assert.match(result.printed, /kind: "commands"/);
});

runCase("query handles are unique across classes in one file", () => {
	const result = compileFixture(`
${header}
	@schedule class Update {}
	@component class Position {}
	@component class Velocity {}
	@component class Projectile {}
	@component class Zombie {}
	@system({ schedule: Update })
	class StepZombieMovement {
		run(zombies: Query<[Entity, Position], With<Zombie>>) {}
	}
	@system({ schedule: Update })
	class StepProjectileMovement {
		run(projectiles: Query<[Entity, Position, Velocity], With<Projectile>>) {}
	}
	`);
	assertNoDiagnostics(result, "unique query handles");
	assert.match(result.printed, /handle: "src\/main@StepZombieMovement:0"/);
	assert.match(result.printed, /handle: "src\/main@StepProjectileMovement:0"/);
	assert.match(result.printed, /id: "src\/main@StepZombieMovement:0"/);
	assert.match(result.printed, /id: "src\/main@StepProjectileMovement:0"/);
});

runCase("observer event param lowers to kind event", () => {
	const result = compileFixture(`
${header}
@event() class DamageTaken {}
@observer({ event: DamageTaken, priority: 2 })
class DamageObserver {
	run(event: DamageTaken, commands: Commands) {}
}
`);
	assertNoDiagnostics(result, "observer lowering");
	assert.match(result.printed, /priority: 2/);
	assert.match(result.printed, /kind: "event"/);
	assert.match(result.printed, /kind: "commands"/);
});

runCase("collector params lower in system observer and monitor methods", () => {
	const result = compileFixture(`
${header}
@schedule class Update {}
@collect class FireInbox extends Collector<unknown> {}
@event() class DamageTaken {}
@component class Health {}
@system({ schedule: Update })
class DrainSystem {
	run(inbox: FireInbox) {}
}
@observer({ event: DamageTaken })
class DamageObserver {
	run(event: DamageTaken, inbox: FireInbox) {}
}
@monitor({ match: query<[Entity, Health]>() })
class HealthMonitor {
	onEnter(entity: Entity, health: Health, inbox: FireInbox) {}
}
`);
	assertNoDiagnostics(result, "collector lowering");
	assert.match(result.printed, /__collect\(FireInbox,/);
	assert.match(result.printed, /__system\(DrainSystem, \{[\s\S]*kind: "collect", ctor: FireInbox/);
	assert.match(result.printed, /__observer\(DamageObserver, \{[\s\S]*kind: "event"[\s\S]*kind: "collect", ctor: FireInbox/);
	assert.match(result.printed, /__monitor\(HealthMonitor, \{[\s\S]*kind: "term", index: 1[\s\S]*kind: "collect", ctor: FireInbox/);
});

runCase("@view root registration lowers to rovyVide registry", () => {
	const result = compileFixture(`
${header}
@view()
class HudView {
	render(ctx: ViewContext) {}
}
`);
	assertNoDiagnostics(result, "view root lowering");
	assert.match(result.printed, /from "@rovy\/vide"/);
	assert.match(result.printed, /__view\(HudView, \{ id: "src\/main@HudView", methods: \["render"\], params: \[\s*\{ kind: "context" \}\s*\] \}\)/);
});

runCase("@view render Query param lowers to reactive query descriptor", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@view()
class HudView {
	render(health: Query<[Health]>) {}
}
`);
	assertNoDiagnostics(result, "view query param lowering");
	assert.match(result.printed, /__query\(\{ id: "src\/main@HudView:0"/);
	assert.match(result.printed, /__view\(HudView, \{[\s\S]*params: \[\s*\{ kind: "query", handle: "src\/main@HudView:0" \}\s*\]/);
});

runCase("@view render ViewMonitor param lowers to vide-owned monitor descriptor", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@component class Player {}
@view()
class HudView {
	render(health: ViewMonitor<[Health], With<Player>>) {}
}
`);
	assertNoDiagnostics(result, "view monitor param lowering");
	assert.match(result.printed, /__query\(\{ id: "src\/main@HudView:0:monitor"/);
	assert.match(result.printed, /kind: "viewMonitor", handle: "src\/main@HudView:0:monitor"/);
	assert.match(result.printed, /filters: \{ with: \[Player\] \}/);
});

runCase("@view render supports full system-style injection metadata", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@resource class Clock { constructor(public tick = 0) {} }
@event() class DamageTaken {}
@view()
class HudView {
	render(
		commands: Commands,
		world: World,
		clock: Res<Clock>,
		clockMut: ResMut<Clock>,
		maybeClock: OptRes<Clock>,
		damage: EventReader<DamageTaken>,
		writer: EventWriter<DamageTaken>,
		local: Local<{ open: boolean }>,
		health: Query<[Health]>,
		ctx: ViewContext,
	) {}
}
`);
	assertNoDiagnostics(result, "view full injection lowering");
	assert.match(result.printed, /kind: "commands"/);
	assert.match(result.printed, /kind: "world"/);
	assert.match(result.printed, /kind: "res", ctor: Clock/);
	assert.match(result.printed, /kind: "resMut", ctor: Clock/);
	assert.match(result.printed, /kind: "optRes", ctor: Clock/);
	assert.match(result.printed, /kind: "eventReader", ctor: DamageTaken/);
	assert.match(result.printed, /kind: "eventWriter", ctor: DamageTaken/);
	assert.match(result.printed, /kind: "local", index: 0/);
	assert.match(result.printed, /kind: "query", handle: "src\/main@HudView:8"/);
	assert.match(result.printed, /kind: "context"/);
});

runCase("@ui classes lower render params and static rerender triggers", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@component class Visible {}
@resource class Theme { constructor(public panel = new Color3()) {} }
@event() class InventoryChanged {}
@ui
class ItemRow {
	static rerender = [
		$componentTrigger(Health, { entity: $prop<Entity>("entity"), on: ["changed", "removed"] }),
	];
	constructor(readonly props: Props<{ entity: Entity }>) {}
	render(health: Query<[Entity, Health]>) {
		return textLabel({ Text: "row" });
	}
}
@ui
class InventoryRoot {
	static rerender = [
		$queryTrigger<[Entity, Health], With<Visible>>({ on: ["added", "changed", "removed"] }),
		$resourceTrigger(Theme),
		$eventTrigger(InventoryChanged),
	];
	render(items: Query<[Entity, Health], With<Visible>>, theme: Res<Theme>) {
		return frame({ key: "root" }, [
			child(ItemRow, { entity: 1 as Entity }),
		]);
	}
}
`);
	assertNoDiagnostics(result, "ui class lowering");
	assert.match(result.printed, /from "@rovy\/ui"/);
	assert.match(result.printed, /__ui\(ItemRow, \{ id: "src\/main@ItemRow", methods: \["render"\], params: \[\s*\{ kind: "query", handle: "src\/main@ItemRow:0" \}\s*\], triggers: \[\s*\{ kind: "component", ctor: Health, entity: \{ kind: "prop", key: "entity" \}, on: \["changed", "removed"\] \}\s*\] \}\)/);
	assert.match(result.printed, /__query\(\{ id: "src\/main@InventoryRoot:rerender:0"/);
	assert.match(result.printed, /__ui\(InventoryRoot, \{[\s\S]*params: \[\s*\{ kind: "query", handle: "src\/main@InventoryRoot:0" \}, \{ kind: "res", ctor: Theme \}\s*\][\s\S]*triggers: \[\s*\{ kind: "query", handle: "src\/main@InventoryRoot:rerender:0"/);
	assert.match(result.printed, /kind: "resource", ctor: Theme/);
	assert.match(result.printed, /kind: "event", ctor: InventoryChanged/);
	assert.doesNotMatch(result.printed, /static rerender/);
	assert.doesNotMatch(result.printed, /\$componentTrigger\(Health/);
	assert.doesNotMatch(result.printed, /\$queryTrigger<\[/);
});

runCase("@ui query trigger can be scoped to Entity props", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@ui
class RosterRows {
	static rerender = [
		$queryTrigger<[Entity, Health]>({
			entities: $prop<ReadonlyArray<Entity>>("entities"),
			on: ["changed", "removed"],
		}),
	];
	constructor(readonly props: Props<{ entities: ReadonlyArray<Entity> }>) {}
	render(rows: Query<[Entity, Health]>) {
		return textLabel({ Text: "rows" });
	}
}
`);
	assertNoDiagnostics(result, "ui query trigger entity prop lowering");
	assert.match(result.printed, /triggers: \[\s*\{ kind: "query", handle: "src\/main@RosterRows:rerender:0", entities: \{ kind: "prop", key: "entities" \}, on: \["changed", "removed"\] \}\s*\]/);
});

runCase("@ui query trigger entity prop validation rejects non-entity props", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@ui
class BadRows {
	static rerender = [
		$queryTrigger<[Entity, Health]>({
			entities: $prop<ReadonlyArray<Entity>>("ids"),
		}),
	];
	constructor(readonly props: Props<{ ids: ReadonlyArray<string> }>) {}
	render(rows: Query<[Entity, Health]>) {
		return textLabel({ Text: "rows" });
	}
}
`);
	assert.match(result.diagnostics.join("\n"), /\$queryTrigger entities prop 'ids' must be Entity or readonly Entity\[\]/);
});

runCase("@ui query trigger entity prop validation rejects non-entity prop type arguments", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@ui
class BadRows {
	static rerender = [
		$queryTrigger<[Entity, Health]>({
			entities: $prop<ReadonlyArray<string>>("ids"),
		}),
	];
	constructor(readonly props: Props<{ ids: ReadonlyArray<Entity> }>) {}
	render(rows: Query<[Entity, Health]>) {
		return textLabel({ Text: "rows" });
	}
}
`);
	assert.match(result.diagnostics.join("\n"), /\$queryTrigger entities \$prop\('ids'\) must be typed as Entity or readonly Entity\[\]/);
});

runCase("@ui query trigger entity prop validation rejects unknown props", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@ui
class BadRows {
	static rerender = [
		$queryTrigger<[Entity, Health]>({
			entities: $prop<ReadonlyArray<Entity>>("missing"),
		}),
	];
	constructor(readonly props: Props<{ ids: ReadonlyArray<Entity> }>) {}
	render(rows: Query<[Entity, Health]>) {
		return textLabel({ Text: "rows" });
	}
}
`);
	assert.match(result.diagnostics.join("\n"), /\$queryTrigger entities references unknown prop 'missing'/);
});

runCase("@ui factory and JSX calls receive stable callsite ids", () => {
	const result = compileFixture(`
${header}
@ui
class Label {
	render() {
		return textLabel({ Text: "label" });
	}
}
@ui
class Root {
	render() {
		return <frame key="root"><Label /></frame>;
	}
}
`, { fileName: "main.tsx" });
	assertNoDiagnostics(result, "ui callsite lowering");
	assert.match(result.printed, /textLabel\(\{ Text: "label", __callsite: "src\/main:ui:0" \}\)/);
	assert.match(result.printed, /RetainedUi\.native\("Frame"/);
	assert.match(result.printed, /RetainedUi\.child\(Label, \{\}, \{ __callsite: "src\/main:ui:[0-9]+" \}\)/);
	assert.match(result.printed, /\{ __callsite: "src\/main:ui:[0-9]+", key: "root" \}/);
});

runCase("@ui JSX component children lower into props.children", () => {
	const result = compileFixture(`
${header}
@ui
class Badge {
	constructor(readonly props: Props<{ text: string }>) {}
	render() {
		return textLabel({ Text: this.props.text });
	}
}
@ui
class Panel {
	constructor(readonly props: Props<{ title: string; children?: UiChildren }>) {}
	render() {
		return frame({}, [
			textLabel({ Text: this.props.title }),
			fragment(this.props.children),
		]);
	}
}
@ui
class Root {
	render() {
		return (
			<Panel title="Loadout">
				<Badge key="sword" text="Sword" />
				<Badge key="shield" text="Shield" />
			</Panel>
		);
	}
}
`, { fileName: "main.tsx" });
	assertNoDiagnostics(result, "ui JSX component children lowering");
	assert.match(result.printed, /RetainedUi\.child\(Panel, \{[\s\S]*title: "Loadout"[\s\S]*children: \[[\s\S]*RetainedUi\.child\(Badge, \{ text: "Sword" \}, \{ __callsite: "src\/main:ui:[0-9]+", key: "sword" \}\)[\s\S]*RetainedUi\.child\(Badge, \{ text: "Shield" \}, \{ __callsite: "src\/main:ui:[0-9]+", key: "shield" \}\)[\s\S]*\][\s\S]*\}, \{ __callsite: "src\/main:ui:[0-9]+" \}\)/);
	assert.doesNotMatch(result.printed, /\{ key: "sword", text: "Sword" \}/);
	assert.doesNotMatch(result.printed, /\{ key: "shield", text: "Shield" \}/);
});

runCase("@view match option is rejected in favor of render params", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@component class Player {}
@view({ match: query<[Entity, Health], With<Player>>() })
class HealthRowView {
	render(ctx: ViewContext) {}
}
`);
	assert.match(result.diagnostics.join("\n"), /@view match is not supported/);
	assert.doesNotMatch(result.printed, /__query\(\{ id: "src\/main@HealthRowView:match"/);
	assert.doesNotMatch(result.printed, /match: "src\/main@HealthRowView:match"/);
	assert.match(result.printed, /methods: \["render"\]/);
});

runCase("@view events map is rejected in favor of render params", () => {
	const result = compileFixture(`
${header}
@event() class DamageTaken {}
@view({ events: { damage: DamageTaken } })
class CombatFeedView {
	render(ctx: ViewContext) {}
	damage(event: DamageTaken, ctx: ViewContext) {}
}
`);
	assert.match(result.diagnostics.join("\n"), /@view events are not supported/);
	assert.doesNotMatch(result.printed, /events: \{ damage: DamageTaken \}/);
	assert.match(result.printed, /methods: \["render"\]/);
});

runCase("@view requires render", () => {
	const result = compileFixture(`
${header}
@view()
class BrokenView {}
`);
	assert.match(result.diagnostics.join("\n"), /@view classes require render/);
});

runCase("query macro lowers inside view render for ctx.query", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@component class Mana {}
@view()
class HudView {
	render(ctx: ViewContext) {
		const health = ctx.query(query<[Entity, Health]>());
		const mana = ctx.query(query<[Entity, Mana]>());
		return { health, mana };
	}
}
`);
	assertNoDiagnostics(result, "view ctx query lowering");
	assert.match(result.printed, /ctx\.query\("src\/main:query:0"\)/);
	assert.match(result.printed, /__query\(\{ id: "src\/main:query:0"/);
	assert.match(result.printed, /ctx\.query\("src\/main:query:1"\)/);
	assert.match(result.printed, /__query\(\{ id: "src\/main:query:1"/);
});

runCase("ctx.events remains a runtime call inside view render", () => {
	const result = compileFixture(`
${header}
@event() class DamageTaken {}
@view()
class HudView {
	render(ctx: ViewContext) {
		return ctx.events(DamageTaken, { limit: 3 });
	}
}
`);
	assertNoDiagnostics(result, "view ctx events runtime call");
	assert.match(result.printed, /ctx\.events\(DamageTaken, \{ limit: 3 \}\)/);
	assert.doesNotMatch(result.printed, /events: \{/);
});

runCase("loadPaths string lowers through rojo path", () => {
	const result = compileFixture(`
${header}
rovy.loadPaths("src");
`);
	assertNoDiagnostics(result, "loadPaths lowering");
	assert.match(result.printed, /game\.GetService\("ReplicatedStorage"\)/);
	assert.match(result.printed, /WaitForChild\("game"\)/);
});

runCase("loadPaths plugin root lowers with pluginRoot marker", () => {
	const result = compileFixture(`
${header}
rovy.loadPaths("src/plugins/combat");
`, {
		files: {
			"plugins/combat/.rovy.plugin.json": "{}",
			"plugins/combat/client/index.ts": "export {};",
			"plugins/combat/shared/index.ts": "export {};",
			"plugins/combat/server/index.ts": "export {};",
		},
	});
	assertNoDiagnostics(result, "plugin loadPaths lowering");
	assert.match(result.printed, /rovy\.loadPaths\(rovy\.pluginRoot\(game\.GetService\("ReplicatedStorage"\)/);
	assert.match(result.printed, /WaitForChild\("plugins"\)\.WaitForChild\("combat"\)/);
});

runCase("resource ctor validation catches required params", () => {
	const result = compileFixture(`
${header}
@resource
class Clock {
	constructor(public tick: number) {}
}
`);
	assert.match(result.diagnostics.join("\n"), /constructor params must be optional or defaulted/);
});

runCase("collect ctor validation catches required params", () => {
	const result = compileFixture(`
${header}
@collect
class FireInbox extends Collector<number> {
	constructor(public seed: number) {}
}
`);
	assert.match(result.diagnostics.join("\n"), /@collect constructor params must be optional or defaulted/);
});

runCase("$collectRef validation catches missing type arg", () => {
	const result = compileFixture(`
${header}
@resource
class InboxRefs {
	readonly inbox = $collectRef();
}
`);
	assert.match(result.diagnostics.join("\n"), /\$collectRef<T>\(\) requires exactly one type argument/);
});

runCase("$collectRef validation catches non-collect type", () => {
	const result = compileFixture(`
${header}
class Plain {}
@resource
class InboxRefs {
	readonly inbox = $collectRef<Plain>();
}
`);
	assert.match(result.diagnostics.join("\n"), /\$collectRef<T>\(\) requires T to be an @collect class/);
});

runCase("$collectRef validation catches unsupported usage site", () => {
	const result = compileFixture(`
${header}
@collect class FireInbox extends Collector<unknown> {}
class Plain {
	readonly inbox = $collectRef<FireInbox>();
}
`);
	assert.match(result.diagnostics.join("\n"), /\$collectRef<T>\(\) is only supported as a @resource field initializer/);
});

runCase("generic system validation fires", () => {
	const result = compileFixture(`
${header}
@schedule class Update {}
@system({ schedule: Update })
class GenericSystem<T> {
	run(commands: Commands) {}
}
`);
	assert.match(result.diagnostics.join("\n"), /cannot be generic/);
});

runCase("monitor match must use query macro", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@monitor({ match: "bad" as never })
class BadMonitor {
	onEnter(health: Health) {}
}
`);
	assert.match(result.diagnostics.join("\n"), /requires match: query<\.\.\.\>\(\)/);
});

runCase("unsupported bare param type surfaces diagnostic", () => {
	const result = compileFixture(`
${header}
@schedule class Update {}
class Plain {}
@system({ schedule: Update })
class BadSystem {
	run(plain: Plain) {}
}
`);
	assert.match(result.diagnostics.join("\n"), /unsupported injected param type/);
});

// ─── Prefab tests ──────────────────────────────────────────────────────────────

runCase("prefab decorator injects __prefab registry call", () => {
	const result = compileFixture(`
${header}

@resource class Clock { constructor(public tick = 0) {} }
@prefab
class SlimePrefab extends Prefab {
	build(commands: Commands, clock: Res<Clock>): Entity {
		const entity = this.entity();
		return entity;
	}
}
`);
	assertNoDiagnostics(result, "prefab lowering");
	assert.match(result.printed, /__prefab\(SlimePrefab,/);
	assert.match(result.printed, /id: ".*@SlimePrefab"/);
	assert.match(result.printed, /kind: "commands"/);
	assert.match(result.printed, /kind: "res"/);
	assert.doesNotMatch(result.printed, /@prefab/);
});

runCase("prefab with EventWriter param lowers correctly", () => {
	const result = compileFixture(`
${header}

@event() class SpawnNotify {}
@prefab
class SpawnPrefab extends Prefab {
	build(w: EventWriter<SpawnNotify>): Entity {
		return this.entity();
	}
}
`);
	assertNoDiagnostics(result, "prefab EventWriter param");
	assert.match(result.printed, /__prefab\(SpawnPrefab,/);
	assert.match(result.printed, /kind: "eventWriter"/);
});

runCase("prefab with collect param lowers correctly", () => {
	const result = compileFixture(`
${header}

@collect class SpawnInbox extends Collector<unknown> {}
@prefab
class InboxPrefab extends Prefab {
	build(inbox: SpawnInbox): Entity {
		return this.entity();
	}
}
`);
	assertNoDiagnostics(result, "prefab collect param");
	assert.match(result.printed, /__prefab\(InboxPrefab,/);
	assert.match(result.printed, /kind: "collect"/);
});

runCase("prefab with no params lowers with empty params array", () => {
	const result = compileFixture(`
${header}

@prefab
class EmptyPrefab extends Prefab {
	build(): Entity {
		return this.entity();
	}
}
`);
	assertNoDiagnostics(result, "prefab empty params");
	assert.match(result.printed, /__prefab\(EmptyPrefab,/);
	assert.match(result.printed, /params: \[\]/);
});

runCase("prefab without build method emits diagnostic", () => {
	const result = compileFixture(`
${header}

@prefab
class NoBuildPrefab extends Prefab {}
`);
	assert.match(result.diagnostics.join("\n"), /@prefab classes require a build\(\.\.\.\) method/);
});

runCase("prefab rejects Query param with diagnostic", () => {
	const result = compileFixture(`
${header}

@component class Position {}
@prefab
class BadPrefab extends Prefab {
	build(q: Query<[Position]>): Entity {
		return this.entity();
	}
}
`);
	assert.match(result.diagnostics.join("\n"), /@prefab build\(\) cannot inject Query/);
});

runCase("prefab rejects EventReader param with diagnostic", () => {
	const result = compileFixture(`
${header}

@event() class MyEvent {}
@prefab
class BadPrefab extends Prefab {
	build(r: EventReader<MyEvent>): Entity {
		return this.entity();
	}
}
`);
	assert.match(result.diagnostics.join("\n"), /@prefab build\(\) cannot inject EventReader/);
});

runCase("prefab rejects Local param with diagnostic", () => {
	const result = compileFixture(`
${header}

interface MyState { count: number }
@prefab
class BadPrefab extends Prefab {
	build(state: Local<MyState>): Entity {
		return this.entity();
	}
}
`);
	assert.match(result.diagnostics.join("\n"), /@prefab build\(\) cannot inject Local/);
});

runCase("prefab rejects required constructor params", () => {
	const result = compileFixture(`
${header}

@prefab
class BadPrefab extends Prefab {
	constructor(x: number) { super(); }
	build(): Entity { return this.entity(); }
}
`);
	assert.match(result.diagnostics.join("\n"), /@prefab constructor params must be optional or defaulted/);
});

console.log("rovy-transformer cases OK");
