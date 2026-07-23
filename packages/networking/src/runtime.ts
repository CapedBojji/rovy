import type { Commands } from "@rovy/core";
import type { NetClientRuntime } from "./client-runtime";
import type { NetClient, NetFunc } from "./client-runtime";
import type { NetEventContext } from "./context";
import { requireNetBoundaryProvider } from "./provider";
import type { NetServerRuntime } from "./server-runtime";
import type { NetFunctionReader, NetFunctionResponder, NetServer } from "./server-runtime";
import type {
	ClientToServerNetFunction,
	NetCallHandle,
	NetEventReceiveMode,
	NetEventReg,
	NetFunctionCall,
	NetFunctionCallResult,
	NetFunctionReg,
	NetFunctionRequestEnvelope,
	NetFunctionRequestOutboxItem,
	NetFunctionResult,
	NetFunctionResultEnvelope,
	NetFunctionResultOutboxItem,
	NetOutboxItem,
	NetTarget,
	RuntimeBoundary,
} from "./types";

type ActiveRuntime = NetClientRuntime | NetServerRuntime;

/**
 * @deprecated Use NetClientRuntime or NetServerRuntime. The compatibility
 * facade contains no boundary implementation and delegates to the active one.
 */
export class NetRuntime {
	readonly client: NetClient;
	readonly server: NetServer;
	readonly context: NetEventContext;
	readonly responder: NetFunctionResponder;
	private boundary: "client" | "server";
	private readonly active: ActiveRuntime;

	constructor(
		events?: ReadonlyArray<NetEventReg>,
		functions?: ReadonlyArray<NetFunctionReg>,
		delegate?: object,
		boundary?: "client" | "server",
	) {
		const provider = delegate === undefined ? requireNetBoundaryProvider() : undefined;
		this.boundary = boundary ?? provider!.boundary;
		this.active = (delegate ?? provider!.createRuntime(events, functions)) as ActiveRuntime;
		const shape = this.active as ActiveRuntime & {
			readonly client?: NetClient;
			readonly server?: NetServer;
			readonly context?: NetEventContext;
			readonly responder?: NetFunctionResponder;
		};
		this.client = shape.client as NetClient;
		this.server = shape.server as NetServer;
		this.context = shape.context as NetEventContext;
		this.responder = shape.responder as NetFunctionResponder;
	}

	register(meta: NetEventReg): void {
		this.active.register(meta);
	}
	registerFunction(meta: NetFunctionReg): void {
		this.active.registerFunction(meta);
	}
	setBoundary(boundary: RuntimeBoundary): void {
		if (boundary === "unknown") return;
		assert(boundary === this.boundary, `[rovy-net] ${boundary} requested, but only ${this.boundary} runtime is loaded`);
	}
	getBoundary(): RuntimeBoundary {
		return this.boundary;
	}
	metaForEvent(event: object): NetEventReg {
		return this.active.metaForEvent(event);
	}
	metaForFunction(request: object): NetFunctionReg {
		this.assertClient("metaForFunction");
		return (this.active as NetClientRuntime).metaForFunction(request);
	}
	functionReader<F extends object>(functionId: string): NetFunctionReader<F> {
		this.assertServer("functionReader");
		return (this.active as NetServerRuntime).functionReader<F>(functionId);
	}
	functionParam<F extends ClientToServerNetFunction, R extends object>(functionId: string): NetFunc<F, R> {
		this.assertClient("functionParam");
		return (this.active as NetClientRuntime).functionParam<F, R>(functionId);
	}
	enqueueClient(mode: NetEventReceiveMode, event: object): void {
		this.assertClient(`NetClient.${mode}`);
		(this.active as NetClientRuntime).enqueue(mode, event);
	}
	enqueueServer(mode: NetEventReceiveMode, target: NetTarget, event: object, method: string): void {
		this.assertServer(`NetServer.${method}`);
		(this.active as NetServerRuntime).enqueue(mode, target, event, method);
	}
	callFunction<F extends ClientToServerNetFunction, R extends object>(
		request: F,
		callSiteId: string,
		functionId?: string,
	): NetCallHandle<F> {
		this.assertClient("NetClient.call");
		return (this.active as NetClientRuntime).callFunction<F, R>(request, callSiteId, functionId);
	}
	enqueueFunctionResult<R extends object>(call: NetFunctionCall, result: NetFunctionResult<R>): void {
		this.assertServer("NetFunctionResponder");
		(this.active as NetServerRuntime).enqueueFunctionResult(call, result);
	}
	drainClientOutbox(): Array<NetOutboxItem> {
		this.assertClient("drainClientOutbox");
		return (this.active as NetClientRuntime).drainOutbox();
	}
	drainFunctionRequestOutbox(): Array<NetFunctionRequestOutboxItem> {
		this.assertClient("drainFunctionRequestOutbox");
		return (this.active as NetClientRuntime).drainFunctionRequestOutbox();
	}
	drainServerOutbox(): Array<NetOutboxItem> {
		this.assertServer("drainServerOutbox");
		return (this.active as NetServerRuntime).drainOutbox();
	}
	drainFunctionResultOutbox(): Array<NetFunctionResultOutboxItem> {
		this.assertServer("drainFunctionResultOutbox");
		return (this.active as NetServerRuntime).drainFunctionResultOutbox();
	}
	receive(
		event: object,
		commands: Pick<Commands, "send" | "trigger">,
		sender?: Player,
		mode?: NetEventReceiveMode,
	): void {
		if (this.boundary === "client") {
			(this.active as NetClientRuntime).receive(event, commands, mode);
		} else {
			(this.active as NetServerRuntime).receive(event, commands, sender, mode);
		}
	}
	receiveFunctionRequest(meta: NetFunctionReg, envelope: NetFunctionRequestEnvelope, sender?: Player): void {
		this.assertServer("receiveFunctionRequest");
		(this.active as NetServerRuntime).receiveFunctionRequest(meta, envelope, sender);
	}
	receiveFunctionResult(meta: NetFunctionReg, envelope: NetFunctionResultEnvelope): void {
		this.assertClient("receiveFunctionResult");
		(this.active as NetClientRuntime).receiveFunctionResult(meta, envelope);
	}
	readFunctionCalls(functionId: string, cb: (call: NetFunctionCall) => void): void {
		this.assertServer("readFunctionCalls");
		(this.active as NetServerRuntime).readFunctionCalls(functionId, cb);
	}
	getFunctionResult<F extends object, R extends object>(handle: NetCallHandle<F>): NetFunctionCallResult<R> {
		this.assertClient("getFunctionResult");
		return (this.active as NetClientRuntime).getFunctionResult<F, R>(handle);
	}
	hasFunctionResult<F extends object>(handle: NetCallHandle<F>): boolean {
		this.assertClient("hasFunctionResult");
		return (this.active as NetClientRuntime).hasFunctionResult(handle);
	}
	endFrame(): void {
		this.active.endFrame();
	}
	encodeFunctionRequest(item: NetFunctionRequestOutboxItem): NetFunctionRequestEnvelope {
		this.assertClient("encodeFunctionRequest");
		return (this.active as NetClientRuntime).encodeFunctionRequest(item);
	}
	encodeFunctionResult(item: NetFunctionResultOutboxItem): NetFunctionResultEnvelope {
		this.assertServer("encodeFunctionResult");
		return (this.active as NetServerRuntime).encodeFunctionResult(item);
	}

	private assertClient(method: string): void {
		assert(this.boundary === "client", `[rovy-net] ${method} can only be called from the client`);
	}
	private assertServer(method: string): void {
		assert(this.boundary === "server", `[rovy-net] ${method} can only be called from the server`);
	}
}
