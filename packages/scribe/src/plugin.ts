import {
	client,
	plugin,
	registerAppExtension,
	rovy,
	server,
	shared,
	type App,
	type ParamDescriptor,
	type Plugin,
	type RovyRegistry,
} from "@rovy/core";
import type {
	AnyScribeData,
	ScribeFullSchema,
	ScribePersistedShape,
} from "./definitions";
import {
	resolveScribeBinding,
	type ScribeModuleResolver,
} from "./binding";
import {
	SCRIBE_CLIENT_DATA_PARAM_KINDS,
	SCRIBE_COMMAND_RESPONDER_PARAM,
	SCRIBE_DIAGNOSTICS_PARAM,
	SCRIBE_SERVER_DATA_PARAM_KINDS,
	commandClientParamId,
	commandReaderParamId,
	isScribeParamId,
	scribeDataParamId,
} from "./param-ids";
import {
	detectScribeRuntimeBoundary,
	isActiveScribeBoundary,
	registerScribeBoundaryProvider,
	requireScribeBoundaryProvider,
	type ScribeBoundaryPluginDelegate,
} from "./provider";
import { rovyScribe } from "./registry";
import {
	compileScribeEventRoutes,
	type ScribeEventRoute,
} from "./event-runtime";
import {
	compileScribeCommandPlans,
	type ScribeCommandPlan,
} from "./command-runtime";
import {
	ScribeRuntime,
	type ScribeRuntimeBoundary,
	type ScribeRuntimeServerSetup,
} from "./runtime";
import type { ScribeNativeModule, ScribeSerializable, ScribeTransport } from "./types";
import type {
	ScribeInitializationTree as ScribeInitializationSchemaTree,
	ScribeReadTree,
	ScribeWriteTree,
} from "./trees";

export interface ScribeProcessConfiguration {
	readonly autoSaveInterval?: number;
}

export { type ScribeModuleResolver } from "./binding";

export interface ScribePluginOptions {
	readonly module?: ModuleScript | ScribeNativeModule;
	readonly resolveModule?: ScribeModuleResolver;
	readonly configure?: ScribeProcessConfiguration;
	readonly transport?: ScribeTransport;
	readonly strict?: boolean;
}

export type ScribeImmediateTree<D extends AnyScribeData> =
	& ScribeReadTree<ScribeFullSchema<D>>
	& ScribeWriteTree<ScribeFullSchema<D>>;

export type ScribeInitializationTree<D extends AnyScribeData> =
	ScribeInitializationSchemaTree<ScribeFullSchema<D>>;

export interface ScribeMigration<D extends AnyScribeData> {
	readonly version: number;
	readonly migrate: (data: ScribePersistedShape<D>) => ScribePersistedShape<D>;
}

export interface ScribeProductGrantContext<D extends AnyScribeData> {
	readonly data: ScribeImmediateTree<D>;
}

export interface ScribeServerSetup<D extends AnyScribeData> {
	readonly migrations?: ReadonlyArray<ScribeMigration<D>>;
	readonly onPlayerInit?: (
		player: Player,
		data: ScribeInitializationTree<D>,
		isNewProfile: boolean,
	) => void;
	readonly productGrants?: Readonly<Record<string, (context: ScribeProductGrantContext<D>) => void>>;
	readonly economy?: {
		readonly resolve?: (player: Player) => Readonly<Record<string, ScribeSerializable>>;
		readonly currencyResolve?: Readonly<
			Record<string, (player: Player) => Readonly<Record<string, ScribeSerializable>>>
		>;
		readonly logEconomyEvent?: (...args: ReadonlyArray<ScribeSerializable>) => void;
	};
	readonly profileStore?: unknown;
}

export interface ConfiguredScribeServer<D extends AnyScribeData> {
	readonly definition: D;
	readonly setup: ScribeServerSetup<D>;
}

export function configureScribeServer<D extends AnyScribeData>(
	definition: D,
	setup: ScribeServerSetup<D>,
): ConfiguredScribeServer<D> {
	return { definition, setup };
}

export interface ScribeServerPluginOptions extends ScribePluginOptions {
	readonly bundles?: ReadonlyArray<ConfiguredScribeServer<AnyScribeData>>;
}

export interface ScribeClientPluginOptions extends ScribePluginOptions {}

const SCRIBE_RUNTIME_MARKER = "__rovyScribeRuntime";
let installedVersion: string | undefined;
let installedProcessConfiguration:
	| Readonly<Record<string, unknown>>
	| undefined;
let scribeBundleConstructed = false;

@client
export class ScribeClientPlugin implements Plugin, ScribeBoundaryPluginDelegate {
	private static readonly resetHook = registerScribePluginResetHook();
	private static readonly provider = registerScribeBoundaryProvider({
		boundary: "client",
		createPlugin(options) {
			return new ScribeClientPlugin(options as ScribeClientPluginOptions);
		},
	});
	private static readonly extension = registerAppExtension((app, registry) => {
		if (!isActiveScribeBoundary("client")) return;
		if (!registryNeedsScribe(registry)) return;
		new ScribeClientPlugin().build(app, registry);
	});
	readonly boundary = "client";
	runtime?: ScribeRuntime;

	constructor(private readonly options: ScribeClientPluginOptions = {}) {}

	build(app: App, registry: RovyRegistry = rovy.registry): void {
		this.runtime = installScribeRuntime(
			app,
			this.boundary,
			this.options,
			compileScribeEventRoutes(registry, rovyScribe.events()),
			compileScribeCommandPlans(
				registry,
				rovyScribe.commands(),
				this.boundary,
			),
		);
	}
}

@server
export class ScribeServerPlugin implements Plugin, ScribeBoundaryPluginDelegate {
	private static readonly resetHook = registerScribePluginResetHook();
	private static readonly provider = registerScribeBoundaryProvider({
		boundary: "server",
		createPlugin(options) {
			return new ScribeServerPlugin(options as ScribeServerPluginOptions);
		},
	});
	private static readonly extension = registerAppExtension((app, registry) => {
		if (!isActiveScribeBoundary("server")) return;
		if (!registryNeedsScribe(registry)) return;
		new ScribeServerPlugin().build(app, registry);
	});
	readonly boundary = "server";
	runtime?: ScribeRuntime;

	constructor(private readonly options: ScribeServerPluginOptions = {}) {}

	build(app: App, registry: RovyRegistry = rovy.registry): void {
		this.runtime = installScribeRuntime(
			app,
			this.boundary,
			this.options,
			compileScribeEventRoutes(registry, rovyScribe.events()),
			compileScribeCommandPlans(
				registry,
				rovyScribe.commands(),
				this.boundary,
			),
		);
	}
}

@shared
@plugin
export class ScribePlugin implements Plugin {
	private readonly delegate: ScribeBoundaryPluginDelegate;
	runtime?: ScribeRuntime;

	constructor(options: ScribePluginOptions = {}) {
		this.delegate = requireScribeBoundaryProvider().createPlugin(options);
		this.runtime = this.delegate.runtime;
	}

	build(app: App): void {
		this.delegate.build(app);
		this.runtime = this.delegate.runtime;
	}
}

export function scribeVersion(): string {
	assert(
		installedVersion !== undefined,
		"[rovy/scribe] scribeVersion() is unavailable before a Scribe runtime installs",
	);
	return installedVersion;
}

function registerScribePluginResetHook(): true {
	rovyScribe.__registerResetHook(() => {
		installedVersion = undefined;
		installedProcessConfiguration = undefined;
		scribeBundleConstructed = false;
	});
	return true;
}

function installScribeRuntime(
	app: App,
	boundary: ScribeRuntimeBoundary,
	options: ScribePluginOptions,
	eventRoutes: ReadonlyArray<ScribeEventRoute>,
	commandPlans: ReadonlyArray<ScribeCommandPlan>,
): ScribeRuntime {
	const marked = app as App & Record<string, unknown>;
	const existing = marked[SCRIBE_RUNTIME_MARKER] as ScribeRuntime | undefined;
	if (existing !== undefined) return existing;

	const binding = resolveScribeBinding(
		options.module,
		options.resolveModule ?? rovyScribe.moduleResolver(),
	);
	if (installedVersion !== undefined) {
		assert(
			installedVersion === binding.version,
			`[rovy/scribe] conflicting Scribe versions in one process: '${installedVersion}' and '${binding.version}'`,
		);
	} else {
		installedVersion = binding.version;
	}
	configureScribeProcess(binding, options.configure);

	const setups = boundary === "server"
		? compileServerSetups(options as ScribeServerPluginOptions)
		: undefined;
	const runtime = new ScribeRuntime(
		boundary,
		binding,
		rovyScribe.dataDefinitions(),
		options.transport,
		setups,
		eventRoutes,
		commandPlans,
	);
	scribeBundleConstructed = true;
	marked[SCRIBE_RUNTIME_MARKER] = runtime;
	app.registerFlushParticipant(runtime);
	app.insertParam(SCRIBE_DIAGNOSTICS_PARAM, runtime.diagnostics);

	const kinds = boundary === "client"
		? SCRIBE_CLIENT_DATA_PARAM_KINDS
		: SCRIBE_SERVER_DATA_PARAM_KINDS;
	for (const definition of rovyScribe.dataDefinitions()) {
		for (const kind of kinds) {
			app.insertParam(
				scribeDataParamId(kind, definition.id),
				runtime.handle(kind, definition.id),
			);
		}
	}

	for (const command of rovyScribe.commands()) {
		if (!runtime.hasCommandPlan(command.id)) continue;
		if (boundary === "client") {
			app.insertParam(
				commandClientParamId(command.id),
				runtime.commandClient(command.id),
			);
		} else {
			app.insertParam(
				commandReaderParamId(command.id),
				runtime.commandReader(command.id),
			);
		}
	}
	if (boundary === "server") {
		app.insertParam(
			SCRIBE_COMMAND_RESPONDER_PARAM,
			runtime.commandResponder(),
		);
	}
	return runtime;
}

function configureScribeProcess(
	binding: ReturnType<typeof resolveScribeBinding>,
	configuration?: ScribeProcessConfiguration,
): void {
	if (configuration === undefined) return;
	const compiled: Readonly<Record<string, unknown>> =
		configuration?.autoSaveInterval !== undefined
			? { AutoSaveInterval: configuration.autoSaveInterval }
			: {};
	if (installedProcessConfiguration !== undefined) {
		assert(
			sameProcessConfiguration(installedProcessConfiguration, compiled),
			"[rovy/scribe] conflicting process-wide Scribe.Configure values across Rovy apps",
		);
		return;
	}
	assert(
		!scribeBundleConstructed,
		"[rovy/scribe] ScribePlugin.configure must be provided before any Scribe bundle is constructed",
	);
	installedProcessConfiguration = compiled;
	binding.configure(compiled);
}

function sameProcessConfiguration(
	left: Readonly<Record<string, unknown>>,
	right: Readonly<Record<string, unknown>>,
): boolean {
	return left.AutoSaveInterval === right.AutoSaveInterval;
}

function compileServerSetups(
	options: ScribeServerPluginOptions,
): ReadonlyMap<string, ScribeRuntimeServerSetup> | undefined {
	if (options.bundles === undefined) return undefined;
	const output = new Map<string, ScribeRuntimeServerSetup>();
	for (const configured of options.bundles) {
		const dataId = configured.definition.id;
		assert(
			rovyScribe.data(dataId) !== undefined,
			`[rovy/scribe] configureScribeServer references unknown data definition '${dataId}'`,
		);
		assert(
			!output.has(dataId),
			`[rovy/scribe] duplicate server setup for data definition '${dataId}'`,
		);
		output.set(
			dataId,
			configured.setup as unknown as ScribeRuntimeServerSetup,
		);
	}
	return output;
}

function registryNeedsScribe(registry: RovyRegistry): boolean {
	if (rovyScribe.hasDeclarations()) return true;
	for (const system of registry.systems) {
		if (paramsNeedScribe(system.params)) return true;
	}
	for (const observer of registry.observers) {
		if (paramsNeedScribe(observer.params)) return true;
	}
	for (const monitor of registry.monitors) {
		if (paramsNeedScribe(monitor.params)) return true;
	}
	for (const prefab of registry.prefabs) {
		if (paramsNeedScribe(prefab.params)) return true;
	}
	return false;
}

function paramsNeedScribe(params: ReadonlyArray<ParamDescriptor>): boolean {
	return params.some(
		(param) => param.kind === "external" && isScribeParamId(param.id),
	);
}

export const ACTIVE_SCRIBE_BOUNDARY = detectScribeRuntimeBoundary();
