import type { App, Commands, Ctor, ParamDescriptor, RovyRegistry } from "@rovy/core";
import { registerAppExtension, rovy } from "@rovy/core";
import { NetCodec } from "./codec";
import { rovyNet } from "./registry";
import { NetRuntime } from "./runtime";
import { RemoteEventTransport } from "./transport-remote";
import { BlinkTransport, type BlinkModule } from "./transport-blink";
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
	/**
	 * Schedule the network step (receive + flush) runs in. Pass the schedule
	 * your engine ticks. Omit to wire params only and drive the step manually.
	 */
	readonly schedule?: Ctor;
	/** Internal multi-schedule auto wiring path. */
	readonly schedules?: ReadonlyArray<Ctor>;
	/** Generated Blink module. When present, Blink is used instead of RemoteEvents. */
	readonly blink?: BlinkModule;
	/** Override the transport entirely (tests, custom backends). */
	readonly transport?: NetTransport;
	/** Force a boundary instead of detecting via RunService (headless/tests). */
	readonly boundary?: RuntimeBoundary;
}

const NET_PLUGIN_MARKER = "__rovyNetworkingInstalled";

function detectBoundary(override?: RuntimeBoundary): RuntimeBoundary {
	if (override !== undefined) return override;
	const [ok, runService] = pcall(() => game.GetService("RunService"));
	if (!ok || runService === undefined) return "unknown";
	if (runService.IsServer()) return "server";
	if (runService.IsClient()) return "client";
	return "unknown";
}

function loadGeneratedBlinkModule(boundary: RuntimeBoundary): BlinkModule | undefined {
	const rs = game.GetService("ReplicatedStorage");
	const shared = rs.WaitForChild("TS");
	const net = shared.WaitForChild("net");
	const generated = net.WaitForChild("generated");
	const moduleName = boundary === "server" ? "RovyBlinkServer" : boundary === "client" ? "RovyBlinkClient" : undefined;
	if (moduleName === undefined) return undefined;
	const module = generated.WaitForChild(moduleName) as ModuleScript;
	return require(module) as BlinkModule;
}

/**
 * The only setup an app needs: add this plugin and decorate events with
 * `@netEvent`. The plugin selects a transport (Blink when a generated module
 * is supplied, else RemoteEvents), wires the injected net params, and
 * registers the per-tick receive+flush step — no hand-written transport code.
 */
export class NetPlugin {
	readonly runtime: NetRuntime;
	readonly transport: NetTransport;
	private readonly boundary: RuntimeBoundary;

	constructor(private readonly options: NetPluginOptions = {}) {
		this.runtime = new NetRuntime();
		this.boundary = detectBoundary(options.boundary);
		this.transport =
			options.transport ??
			(options.blink !== undefined
				? new BlinkTransport(options.blink, rovyNet.registry, rovyNet.functions)
				: rovyNet.runtimeConfig.transport === "blink" && this.boundary !== "unknown"
					? new BlinkTransport(loadGeneratedBlinkModule(this.boundary) ?? {}, rovyNet.registry, rovyNet.functions)
				: new RemoteEventTransport());
	}

	build(app: App): void {
		const marked = app as App & Record<string, unknown>;
		if (marked[NET_PLUGIN_MARKER] === true) return;
		marked[NET_PLUGIN_MARKER] = true;
		this.runtime.setBoundary(this.boundary);
		app.insertParam(NET_CLIENT_PARAM, this.runtime.client);
		app.insertParam(NET_SERVER_PARAM, this.runtime.server);
		app.insertParam(NET_EVENT_CONTEXT_PARAM, this.runtime.context);
		app.insertParam(NET_RUNTIME_PARAM, this.runtime);
		app.insertParam(NET_FUNCTION_RESPONDER_PARAM, this.runtime.responder);
		for (const fn of rovyNet.functions) {
			app.insertParam(netFunctionParam(fn.id), this.runtime.functionParam(fn.id));
			app.insertParam(netFunctionReaderParam(fn.id), this.runtime.functionReader(fn.id));
		}

		const runtime = this.runtime;
		const transport = this.transport;
		let activeCommands: Pick<Commands, "send" | "trigger"> | undefined;

		transport.start({
			boundary: this.boundary,
			deliver: (name, payload, sender) => {
				const commands = activeCommands;
				if (commands === undefined) return;
				const meta = rovyNet.byName(name);
				if (meta === undefined) return;
				runtime.receive(NetCodec.decode(meta, payload), commands, sender);
			},
			deliverFunctionRequest: (name, envelope, sender) => {
				const meta = rovyNet.functionByName(name);
				if (meta === undefined) return;
				runtime.receiveFunctionRequest(meta, envelope, sender);
			},
			deliverFunctionResult: (name, envelope) => {
				const meta = rovyNet.functionByName(name);
				if (meta === undefined) return;
				runtime.receiveFunctionResult(meta, envelope);
			},
		});

		// Receive runs before gameplay so inbound events are readable the same
		// tick (event buffers clear at the schedule-run boundary). Flush runs
		// after gameplay so everything produced this tick goes out.
		const receive = (commands: Commands): void => {
			activeCommands = commands;
			transport.pump();
			activeCommands = undefined;
		};
		const flush = (): void => {
			const outbox = this.boundary === "client" ? runtime.drainClientOutbox() : runtime.drainServerOutbox();
			for (const item of outbox) {
				transport.send(item, NetCodec.encode(item.meta, item.event));
			}
			if (this.boundary === "client") {
				for (const item of runtime.drainFunctionRequestOutbox()) {
					transport.sendFunctionRequest(item, runtime.encodeFunctionRequest(item));
				}
			} else if (this.boundary === "server") {
				for (const item of runtime.drainFunctionResultOutbox()) {
					transport.sendFunctionResult(item, runtime.encodeFunctionResult(item));
				}
			}
			transport.commit?.();
			runtime.context.clear();
			runtime.endFrame();
		};

		const schedules =
			this.options.schedules ?? (this.options.schedule !== undefined ? [this.options.schedule] : undefined);
		if (schedules === undefined || schedules.size() === 0) {
			this.manualStep = (commands: Commands): void => {
				receive(commands);
				flush();
			};
			return;
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
	}

	/** Manual driver when no schedule was supplied. */
	manualStep?: (commands: Commands) => void;
}

/** Marker set: networking receive runs before all gameplay sets. */
export class NetReceiveSet {}
/** Marker set: networking flush runs after all gameplay sets. */
export class NetFlushSet {}

function paramsNeedNetworking(params: ReadonlyArray<ParamDescriptor>): boolean {
	return params.some(
		(param) =>
			param.kind === "external" &&
			(param.id === NET_CLIENT_PARAM ||
				param.id === NET_SERVER_PARAM ||
				param.id === NET_EVENT_CONTEXT_PARAM ||
				param.id === NET_FUNCTION_RESPONDER_PARAM ||
				param.id.sub(1, NET_FUNCTION_PARAM_PREFIX.size()) === NET_FUNCTION_PARAM_PREFIX ||
				param.id.sub(1, NET_FUNCTION_READER_PARAM_PREFIX.size()) === NET_FUNCTION_READER_PARAM_PREFIX),
	);
}

function registryNeedsNetworking(registry: RovyRegistry): boolean {
	if (rovyNet.registry.size() > 0) return true;
	for (const system of registry.systems) {
		if (paramsNeedNetworking(system.params)) return true;
	}
	for (const observer of registry.observers) {
		if (paramsNeedNetworking(observer.params)) return true;
	}
	for (const monitor of registry.monitors) {
		if (paramsNeedNetworking(monitor.params)) return true;
	}
	return false;
}

registerAppExtension((app, registry) => {
	if (!registryNeedsNetworking(registry)) return;
	if ((app as App & Record<string, unknown>)[NET_PLUGIN_MARKER] === true) return;
	const schedules = registry.schedules.map((schedule) => schedule.ctor);
	const plugin = new NetPlugin({ schedules });
	plugin.build(app);
});
