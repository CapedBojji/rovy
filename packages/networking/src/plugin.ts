import {
	client,
	plugin,
	registerAppExtension,
	rovy,
	server,
	shared,
	type App,
	type Commands,
	type Ctor,
	type ParamDescriptor,
	type Plugin,
	type RovyRegistry,
} from "@rovy/core";
import { NetClientRuntime } from "./client-runtime";
import { NetCodec } from "./codec";
import {
	detectRuntimeBoundary,
	registerNetBoundaryProvider,
	requireNetBoundaryProvider,
	type BoundaryPluginDelegate,
} from "./provider";
import { rovyNet } from "./registry";
import { NetRuntime } from "./runtime";
import { NetServerRuntime } from "./server-runtime";
import { ClientBlinkTransport, ServerBlinkTransport, type BlinkModule } from "./transport-blink";
import { ClientRemoteEventTransport, ServerRemoteEventTransport } from "./transport-remote";
import type { NetTransport } from "./transport";
import {
	NET_CLIENT_PARAM,
	NET_EVENT_CONTEXT_PARAM,
	NET_FUNCTION_PARAM_PREFIX,
	NET_FUNCTION_READER_PARAM_PREFIX,
	NET_FUNCTION_RESPONDER_PARAM,
	NET_RUNTIME_PARAM,
	NET_SERVER_PARAM,
	netFunctionParam,
	netFunctionReaderParam,
	type RuntimeBoundary,
} from "./types";

export interface NetPluginOptions {
	readonly schedule?: Ctor;
	readonly schedules?: ReadonlyArray<Ctor>;
	readonly blink?: BlinkModule;
	readonly transport?: NetTransport;
	/** @deprecated Active runtime side is selected by the generated facade. */
	readonly boundary?: RuntimeBoundary;
}

export interface NetClientPluginOptions extends Omit<NetPluginOptions, "boundary"> {}
export interface NetServerPluginOptions extends Omit<NetPluginOptions, "boundary"> {}

const NET_PLUGIN_MARKER = "__rovyNetworkingInstalled";

export class NetReceiveSet {}

export class NetFlushSet {}

@client
export class NetClientPlugin implements Plugin {
	private static readonly provider = registerNetBoundaryProvider({
		boundary: "client",
		createRuntime(events, functions) {
			return new NetClientRuntime(events, functions);
		},
		createPlugin(options) {
			return new NetClientPlugin(options as NetClientPluginOptions);
		},
		createRemoteTransport() {
			return new ClientRemoteEventTransport();
		},
		createBlinkTransport(module, events, functions) {
			return new ClientBlinkTransport(module, events, functions);
		},
	});
	private static readonly extension = registerAppExtension((app, registry) => {
		if (!registryNeedsClient(registry)) return;
		new NetClientPlugin({ schedules: registry.schedules.map((schedule) => schedule.ctor) }).build(app);
	});
	readonly runtime: NetClientRuntime;
	readonly transport: NetTransport;
	manualStep?: (commands: Commands) => void;

	constructor(private readonly options: NetClientPluginOptions = {}) {
		this.runtime = new NetClientRuntime();
		this.transport =
			options.transport ??
			(options.blink !== undefined
				? new ClientBlinkTransport(options.blink, rovyNet.registry, rovyNet.functions)
				: rovyNet.runtimeConfig.transport === "blink"
					? new ClientBlinkTransport(loadGeneratedBlinkModule("client") ?? {}, rovyNet.registry, rovyNet.functions)
					: new ClientRemoteEventTransport());
	}

	build(app: App): void {
		if (!markInstalled(app)) return;
		app.insertParam(NET_CLIENT_PARAM, this.runtime.client);
		app.insertParam(NET_RUNTIME_PARAM, this.runtime);
		for (const fn of rovyNet.functions) {
			app.insertParam(netFunctionParam(fn.id), this.runtime.functionParam(fn.id));
		}
		let activeCommands: Pick<Commands, "send" | "trigger"> | undefined;
		this.transport.start({
			boundary: "client",
			deliver: (name, payload) => {
				const commands = activeCommands;
				const meta = rovyNet.byName(name);
				if (commands !== undefined && meta !== undefined) {
					this.runtime.receive(NetCodec.decode(meta, payload), commands);
				}
			},
			deliverFunctionResult: (name, envelope) => {
				const meta = rovyNet.functionByName(name);
				if (meta !== undefined) this.runtime.receiveFunctionResult(meta, envelope);
			},
		});
		const receive = (commands: Commands): void => {
			activeCommands = commands;
			this.transport.pump();
			activeCommands = undefined;
		};
		const flush = (): void => {
			for (const item of this.runtime.drainOutbox()) {
				this.transport.send(item, NetCodec.encode(item.meta, item.event));
			}
			for (const item of this.runtime.drainFunctionRequestOutbox()) {
				this.transport.sendFunctionRequest(item, this.runtime.encodeFunctionRequest(item));
			}
			this.transport.commit?.();
			this.runtime.endFrame();
		};
		this.manualStep = wireStep(app, this.options, receive, flush);
	}
}

@server
export class NetServerPlugin implements Plugin {
	private static readonly provider = registerNetBoundaryProvider({
		boundary: "server",
		createRuntime(events, functions) {
			return new NetServerRuntime(events, functions);
		},
		createPlugin(options) {
			return new NetServerPlugin(options as NetServerPluginOptions);
		},
		createRemoteTransport() {
			return new ServerRemoteEventTransport();
		},
		createBlinkTransport(module, events, functions) {
			return new ServerBlinkTransport(module, events, functions);
		},
	});
	private static readonly extension = registerAppExtension((app, registry) => {
		if (!registryNeedsServer(registry)) return;
		new NetServerPlugin({ schedules: registry.schedules.map((schedule) => schedule.ctor) }).build(app);
	});
	readonly runtime: NetServerRuntime;
	readonly transport: NetTransport;
	manualStep?: (commands: Commands) => void;

	constructor(private readonly options: NetServerPluginOptions = {}) {
		this.runtime = new NetServerRuntime();
		this.transport =
			options.transport ??
			(options.blink !== undefined
				? new ServerBlinkTransport(options.blink, rovyNet.registry, rovyNet.functions)
				: rovyNet.runtimeConfig.transport === "blink"
					? new ServerBlinkTransport(loadGeneratedBlinkModule("server") ?? {}, rovyNet.registry, rovyNet.functions)
					: new ServerRemoteEventTransport());
	}

	build(app: App): void {
		if (!markInstalled(app)) return;
		app.insertParam(NET_SERVER_PARAM, this.runtime.server);
		app.insertParam(NET_EVENT_CONTEXT_PARAM, this.runtime.context);
		app.insertParam(NET_RUNTIME_PARAM, this.runtime);
		app.insertParam(NET_FUNCTION_RESPONDER_PARAM, this.runtime.responder);
		for (const fn of rovyNet.functions) {
			app.insertParam(netFunctionReaderParam(fn.id), this.runtime.functionReader(fn.id));
		}
		let activeCommands: Pick<Commands, "send" | "trigger"> | undefined;
		this.transport.start({
			boundary: "server",
			deliver: (name, payload, sender) => {
				const commands = activeCommands;
				const meta = rovyNet.byName(name);
				if (commands !== undefined && meta !== undefined) {
					this.runtime.receive(NetCodec.decode(meta, payload), commands, sender);
				}
			},
			deliverFunctionRequest: (name, envelope, sender) => {
				const meta = rovyNet.functionByName(name);
				if (meta !== undefined) this.runtime.receiveFunctionRequest(meta, envelope, sender);
			},
		});
		const receive = (commands: Commands): void => {
			activeCommands = commands;
			this.transport.pump();
			activeCommands = undefined;
		};
		const flush = (): void => {
			for (const item of this.runtime.drainOutbox()) {
				this.transport.send(item, NetCodec.encode(item.meta, item.event));
			}
			for (const item of this.runtime.drainFunctionResultOutbox()) {
				this.transport.sendFunctionResult(item, this.runtime.encodeFunctionResult(item));
			}
			this.transport.commit?.();
			this.runtime.endFrame();
		};
		this.manualStep = wireStep(app, this.options, receive, flush);
	}
}

/**
 * @deprecated Use NetClientPlugin or NetServerPlugin. This facade delegates
 * only to the active generated runtime boundary.
 */
@shared
@plugin
export class NetPlugin implements Plugin {
	readonly runtime: NetRuntime;
	readonly transport: NetTransport;
	manualStep?: (commands: Commands) => void;
	private readonly delegate: BoundaryPluginDelegate;

	constructor(private readonly options: NetPluginOptions = {}) {
		const provider = requireNetBoundaryProvider(options.boundary);
		this.delegate = provider.createPlugin(options);
		this.runtime = new NetRuntime(undefined, undefined, this.delegate.runtime, provider.boundary);
		this.transport = this.delegate.transport;
	}

	build(app: App): void {
		this.delegate.build(app);
		this.manualStep = this.delegate.manualStep;
	}
}

function markInstalled(app: App): boolean {
	const marked = app as App & Record<string, unknown>;
	if (marked[NET_PLUGIN_MARKER] === true) return false;
	marked[NET_PLUGIN_MARKER] = true;
	return true;
}

function wireStep(
	app: App,
	options: NetClientPluginOptions | NetServerPluginOptions,
	receive: (commands: Commands) => void,
	flush: () => void,
): ((commands: Commands) => void) | undefined {
	const schedules = options.schedules ?? (options.schedule !== undefined ? [options.schedule] : undefined);
	if (schedules === undefined || schedules.size() === 0) {
		return (commands: Commands): void => {
			receive(commands);
			flush();
		};
	}
	for (const schedule of schedules) {
		const existing = app.scheduler.getSetOrder(schedule);
		app.configureSets(schedule, [NetReceiveSet, ...existing, NetFlushSet]);
		class RovyNetReceive {
			run(commands: Commands): void {
				receive(commands);
			}
		}
		class RovyNetFlush {
			run(): void {
				flush();
			}
		}
		rovy.__system(RovyNetReceive as unknown as Ctor, {
			id: `@rovy/networking/RovyNetReceive:${tostring(schedule)}`,
			schedule,
			set: NetReceiveSet,
			params: [{ kind: "commands" }],
		});
		rovy.__system(RovyNetFlush as unknown as Ctor, {
			id: `@rovy/networking/RovyNetFlush:${tostring(schedule)}`,
			schedule,
			set: NetFlushSet,
			params: [],
		});
	}
	return undefined;
}

function loadGeneratedBlinkModule(boundary: "client" | "server"): BlinkModule | undefined {
	const [ok, result] = pcall(() => {
		const rs = game.GetService("ReplicatedStorage");
		const generated = rs.WaitForChild("TS").WaitForChild("net").WaitForChild("generated");
		const name = boundary === "server" ? "RovyBlinkServer" : "RovyBlinkClient";
		return require(generated.WaitForChild(name) as ModuleScript) as BlinkModule;
	});
	return ok ? result : undefined;
}

function paramsNeed(params: ReadonlyArray<ParamDescriptor>, ids: ReadonlyArray<string>): boolean {
	return params.some(
		(param) =>
			param.kind === "external" &&
			ids.some((id) => param.id === id || param.id.sub(1, id.size()) === id),
	);
}

function registryNeedsClient(registry: RovyRegistry): boolean {
	if (
		(rovyNet.registry.size() > 0 || rovyNet.functions.size() > 0) &&
		detectRuntimeBoundary() === "client"
	) return true;
	for (const system of registry.systems) {
		if (paramsNeed(system.params, [NET_CLIENT_PARAM, NET_FUNCTION_PARAM_PREFIX])) return true;
	}
	for (const observer of registry.observers) {
		if (paramsNeed(observer.params, [NET_CLIENT_PARAM, NET_FUNCTION_PARAM_PREFIX])) return true;
	}
	for (const monitor of registry.monitors) {
		if (paramsNeed(monitor.params, [NET_CLIENT_PARAM, NET_FUNCTION_PARAM_PREFIX])) return true;
	}
	return false;
}

function registryNeedsServer(registry: RovyRegistry): boolean {
	if (
		(rovyNet.registry.size() > 0 || rovyNet.functions.size() > 0) &&
		detectRuntimeBoundary() === "server"
	) return true;
	const ids = [
		NET_SERVER_PARAM,
		NET_EVENT_CONTEXT_PARAM,
		NET_FUNCTION_RESPONDER_PARAM,
		NET_FUNCTION_READER_PARAM_PREFIX,
	];
	for (const system of registry.systems) if (paramsNeed(system.params, ids)) return true;
	for (const observer of registry.observers) if (paramsNeed(observer.params, ids)) return true;
	for (const monitor of registry.monitors) if (paramsNeed(monitor.params, ids)) return true;
	return false;
}

export const ACTIVE_NET_BOUNDARY = detectRuntimeBoundary();
