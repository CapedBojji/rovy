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
	Query,
	Res,
	ResMut,
	Trait,
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
	event,
	monitor,
	observer,
	prefab,
	query,
	resource,
	relation,
	rovy,
	schedule,
	system,
	trait,
} from "@rovy/core";
import {
	NetClient,
	NetEventContext,
	NetId,
	NetServer,
	netEvent,
	rovyNet,
} from "@rovy/networking";
import RovyUi, { Style, StyleScope, button, scope, useEffect, useInstance, useState } from "@rovy/ui";
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

runCase("JSDoc widget functions register and plain calls lower", () => {
	const result = compileFixture(`
${header}
@resource class Theme { constructor(public title = "HUD") {} }

/** @widget */
export function Window(theme: Res<Theme>, options: { title: string }): void {
	print(theme.title, options.title);
}

export function draw() {
	Window({ title: "Inventory" });
}
`);
	assertNoDiagnostics(result, "widget lowering");
	assert.match(result.printed, /Window = RovyUi\.__widget\(Window,/);
	assert.match(result.printed, /id: "src\/main@Window"/);
	assert.match(result.printed, /name: "Window"/);
	assert.match(result.printed, /kind: "res", ctor: Theme/);
	assert.match(result.printed, /RovyUi\.__callWidget\(Window, "src\/main:0", \[\{ title: "Inventory" \}\]\)/);
});

runCase("JSDoc widget functions can use overloads for clean call signatures", () => {
	const result = compileFixture(`
${header}
@resource class Theme { constructor(public title = "HUD") {} }

/** @widget */
export function Window(options: { title: string }): void;
export function Window(theme: Res<Theme>, options?: { title: string }): void {
	if (options) print(theme.title, options.title);
}

export function draw() {
	Window({ title: "Inventory" });
}
`);
	assertNoDiagnostics(result, "widget overload lowering");
	assert.match(result.printed, /Window = RovyUi\.__widget\(Window,/);
	assert.match(result.printed, /RovyUi\.__callWidget\(Window, "src\/main:0", \[\{ title: "Inventory" \}\]\)/);
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
	assert.match(result.printed, /Counter = RovyUi\.__widget\(Counter,/);
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
	assert.match(result.printed, /RovyUi\.__callWidget\(button, "src\/main:4", \["Named"\]\)/);
	assert.match(result.printed, /RovyUi\.__callWidget\(RovyUi\.label, "src\/main:5", \["Namespaced"\]\)/);
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
	assert.match(result.printed, /function Label\(options: \{ text: string; \}\): void \{ const style = RovyUi\.getActiveStyle\(\); print\(style\.textColor, options\.text\); \}/);
	assert.match(result.printed, /params: \[\]/);
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

runCase("widget injected params must precede call args", () => {
	const result = compileFixture(`
${header}
@resource class Theme { constructor(public title = "HUD") {} }

/** @widget */
export function Window(options: { title: string }, theme: Res<Theme>): void {
	print(theme.title, options.title);
}
`);
	assert.match(result.diagnostics.join("\n"), /@widget injected params must come before call args/);
});

runCase("Local params on widgets are treated as call args, not injected state", () => {
	const result = compileFixture(`
${header}
/** @widget */
export function Window(_state: Local<{ count: number }>): void {
	print("state is a caller arg");
}
`);
	assertNoDiagnostics(result, "widget Local call arg");
	assert.match(result.printed, /params: \[\]/);
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

runCase("loadPaths string lowers through rojo path", () => {
	const result = compileFixture(`
${header}
rovy.loadPaths("src");
`);
	assertNoDiagnostics(result, "loadPaths lowering");
	assert.match(result.printed, /game\.GetService\("ReplicatedStorage"\)/);
	assert.match(result.printed, /WaitForChild\("game"\)/);
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
