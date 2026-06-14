import type { Commands } from "@rovy/core";
import { NetEventContext } from "./context";
import { NetCodec } from "./codec";
import { rovyNet } from "./registry";
import type {
	ClientToServerNetEvent,
	ClientToServerNetFunction,
	NetCallHandle,
	NetEventDirection,
	NetEventReceiveMode,
	NetEventReg,
	NetFunctionCall,
	NetFunctionReg,
	NetFunctionCallResult,
	NetFunctionRequestEnvelope,
	NetFunctionRequestOutboxItem,
	NetFunctionResult,
	NetFunctionResultEnvelope,
	NetFunctionResultOutboxItem,
	NetOutboxItem,
	NetTarget,
	RuntimeBoundary,
	ServerToClientNetEvent,
} from "./types";

type Ctor = NetEventReg["ctor"];
const DEFAULT_RESULT_TTL_FRAMES = 300;
const DEFAULT_PENDING_TTL_FRAMES = 600;

interface PendingCall {
	readonly handle: NetCallHandleInternal;
	readonly slotKey: string;
	readonly createdFrame: number;
}

interface StoredResult {
	readonly result: NetFunctionResult;
	readonly expiresFrame: number;
}

type NetCallHandleInternal = {
	readonly functionId: string;
	readonly callSiteId: string;
	readonly sequence: number;
	readonly request?: object;
};

export class NetRuntime {
	readonly client = new NetClient(this);
	readonly server = new NetServer(this);
	readonly context = new NetEventContext();
	readonly responder = new NetFunctionResponder(this);

	private readonly metas = new Map<Ctor, NetEventReg>();
	private readonly functions = new Map<Ctor, NetFunctionReg>();
	private readonly clientOutbox = new Array<NetOutboxItem>();
	private readonly serverOutbox = new Array<NetOutboxItem>();
	private readonly functionRequestOutbox = new Array<NetFunctionRequestOutboxItem>();
	private readonly functionResultOutbox = new Array<NetFunctionResultOutboxItem>();
	private readonly inboundFunctionCalls = new Map<string, Array<NetFunctionCall>>();
	private readonly pendingCalls = new Map<string, PendingCall>();
	private readonly pendingCallSlots = new Map<string, string>();
	private readonly resultInbox = new Map<string, StoredResult>();
	private nextSequence = 0;
	private frame = 0;
	private boundary: RuntimeBoundary = "unknown";

	constructor(
		events: ReadonlyArray<NetEventReg> = rovyNet.registry,
		functions: ReadonlyArray<NetFunctionReg> = rovyNet.functions,
	) {
		for (const event of events) this.register(event);
		for (const fn of functions) this.registerFunction(fn);
	}

	register(meta: NetEventReg): void {
		this.metas.set(meta.ctor, meta);
	}

	registerFunction(meta: NetFunctionReg): void {
		this.functions.set(meta.ctor, meta);
	}

	setBoundary(boundary: RuntimeBoundary): void {
		this.boundary = boundary;
	}

	getBoundary(): RuntimeBoundary {
		return this.boundary;
	}

	metaForEvent(event: object): NetEventReg {
		const ctor = getmetatable(event) as unknown as Ctor | undefined;
		const meta = ctor !== undefined ? this.metas.get(ctor) : undefined;
		assert(meta !== undefined, `[rovy-net] event is not registered with @netEvent: ${tostring(ctor)}`);
		return meta;
	}

	metaForFunction(request: object): NetFunctionReg {
		const ctor = getmetatable(request) as unknown as Ctor | undefined;
		const meta = ctor !== undefined ? this.functions.get(ctor) : undefined;
		assert(meta !== undefined, `[rovy-net] request is not registered with @netFunction: ${tostring(ctor)}`);
		return meta;
	}

	functionReader<F extends object>(functionId: string): NetFunctionReader<F> {
		return new NetFunctionReader(this, functionId);
	}

	functionParam<F extends ClientToServerNetFunction, R extends object>(functionId: string): NetFunc<F, R> {
		return new NetFunc(this, functionId);
	}

	enqueueClient(mode: NetEventReceiveMode, event: object): void {
		this.assertBoundary("client", `NetClient.${mode}`);
		const meta = this.metaForEvent(event);
		this.assertDirection(meta, "clientToServer", "NetClient");
		this.assertReceive(meta, mode);
		this.clientOutbox.push({ mode, event, meta, target: { kind: "server" } });
	}

	enqueueServer(mode: NetEventReceiveMode, target: NetTarget, event: object, method: string): void {
		this.assertBoundary("server", `NetServer.${method}`);
		const meta = this.metaForEvent(event);
		this.assertDirection(meta, "serverToClient", "NetServer");
		this.assertReceive(meta, mode);
		this.serverOutbox.push({ mode, event, meta, target });
	}

	callFunction<F extends ClientToServerNetFunction, R extends object>(
		request: F,
		callSiteId: string,
		functionId?: string,
	): NetCallHandle<F> {
		this.assertBoundary("client", "NetClient.call");
		const meta = this.metaForFunction(request);
		if (functionId !== undefined) {
			assert(meta.id === functionId, `[rovy-net] NetFunc for ${functionId} cannot call ${meta.id}.`);
		}
		assert(meta.direction === "clientToServer", `[rovy-net] ${meta.id} cannot be called by NetClient.`);
		const slotKey = functionSlotKey(meta.id, callSiteId);
		const activeKey = this.pendingCallSlots.get(slotKey);
		if (activeKey !== undefined) {
			const pending = this.pendingCalls.get(activeKey);
			if (pending !== undefined) return pending.handle as NetCallHandle<F>;
			this.pendingCallSlots.delete(slotKey);
		}
		const sequence = this.nextSequence;
		this.nextSequence += 1;
		const handle: NetCallHandleInternal = {
			functionId: meta.id,
			callSiteId,
			sequence,
			request,
		};
		const key = resultKey(handle);
		this.pendingCalls.set(key, { handle, slotKey, createdFrame: this.frame });
		this.pendingCallSlots.set(slotKey, key);
		this.functionRequestOutbox.push({ request, meta, handle, target: { kind: "server" } });
		return handle as NetCallHandle<F>;
	}

	enqueueFunctionResult<R extends object>(call: NetFunctionCall, result: NetFunctionResult<R>): void {
		this.assertBoundary("server", result.ok ? "NetFunctionResponder.resolve" : "NetFunctionResponder.reject");
		const player = call.sender;
		assert(player !== undefined, `[rovy-net] cannot respond to ${call.meta.id}; missing sender.`);
		this.functionResultOutbox.push({
			call,
			result: result as NetFunctionResult,
			target: { kind: "player", player },
		});
	}

	drainClientOutbox(): Array<NetOutboxItem> {
		const out = [...this.clientOutbox];
		this.clientOutbox.clear();
		return out;
	}

	drainFunctionRequestOutbox(): Array<NetFunctionRequestOutboxItem> {
		const out = [...this.functionRequestOutbox];
		this.functionRequestOutbox.clear();
		return out;
	}

	drainServerOutbox(): Array<NetOutboxItem> {
		const out = [...this.serverOutbox];
		this.serverOutbox.clear();
		return out;
	}

	drainFunctionResultOutbox(): Array<NetFunctionResultOutboxItem> {
		const out = [...this.functionResultOutbox];
		this.functionResultOutbox.clear();
		return out;
	}

	receive(
		event: object,
		commands: Pick<Commands, "send" | "trigger">,
		sender?: Player,
		mode?: NetEventReceiveMode,
	): void {
		const meta = this.metaForEvent(event);
		const receiveMode = mode ?? meta.receive;
		this.assertReceive(meta, receiveMode);
		if (sender !== undefined) this.context.setCurrentSender(event, sender);
		if (receiveMode === "send") commands.send(event);
		else commands.trigger(event);
	}

	receiveFunctionRequest(meta: NetFunctionReg, envelope: NetFunctionRequestEnvelope, sender?: Player): void {
		const request = NetCodec.decodeFields(meta.ctor, meta.fields, envelope.payload) as ClientToServerNetFunction;
		const call: NetFunctionCall = {
			request,
			meta,
			handle: {
				functionId: meta.id,
				callSiteId: envelope.callSiteId,
				sequence: envelope.sequence,
				request,
			},
			sender,
		};
		let calls = this.inboundFunctionCalls.get(meta.id);
		if (calls === undefined) {
			calls = [];
			this.inboundFunctionCalls.set(meta.id, calls);
		}
		calls.push(call);
	}

	receiveFunctionResult(meta: NetFunctionReg, envelope: NetFunctionResultEnvelope): void {
		const handle: NetCallHandleInternal = {
			functionId: meta.id,
			callSiteId: envelope.callSiteId,
			sequence: envelope.sequence,
		};
		const key = resultKey(handle);
		const pending = this.pendingCalls.get(key);
		if (pending === undefined || pending.handle.functionId !== meta.id) return;
		const result: NetFunctionResult =
			envelope.ok === true
				? {
						ok: true,
						value: NetCodec.decodeFields(meta.result, meta.resultFields, envelope.payload ?? {}) as object,
					}
				: { ok: false, error: envelope.error ?? "remote function rejected" };
		this.resultInbox.set(key, { result, expiresFrame: this.frame + DEFAULT_RESULT_TTL_FRAMES });
	}

	readFunctionCalls(functionId: string, cb: (call: NetFunctionCall) => void): void {
		for (const call of this.inboundFunctionCalls.get(functionId) ?? []) cb(call);
	}

	takeResult(handle: NetCallHandleInternal): NetFunctionResult | undefined {
		const key = resultKey(handle);
		const stored = this.resultInbox.get(key);
		if (stored === undefined) return undefined;
		if (stored.expiresFrame < this.frame) {
			this.resultInbox.delete(key);
			const pending = this.pendingCalls.get(key);
			if (pending !== undefined) this.pendingCallSlots.delete(pending.slotKey);
			this.pendingCalls.delete(key);
			return undefined;
		}
		this.resultInbox.delete(key);
		const pending = this.pendingCalls.get(key);
		if (pending !== undefined) this.pendingCallSlots.delete(pending.slotKey);
		this.pendingCalls.delete(key);
		return stored.result;
	}

	takeCallResult<R extends object>(handle: NetCallHandleInternal): NetFunctionCallResult<R> {
		const result = this.takeResult(handle) as NetFunctionResult<R> | undefined;
		if (result === undefined) return undefined;
		return result.ok ? result.value : result;
	}

	getFunctionResult<F extends object, R extends object>(handle: NetCallHandle<F>): NetFunctionCallResult<R> {
		return this.takeCallResult<R>(handle as NetCallHandleInternal);
	}

	hasFunctionResult<F extends object>(handle: NetCallHandle<F>): boolean {
		const key = resultKey(handle as NetCallHandleInternal);
		const stored = this.resultInbox.get(key);
		if (stored === undefined) return false;
		if (stored.expiresFrame < this.frame) {
			this.resultInbox.delete(key);
			const pending = this.pendingCalls.get(key);
			if (pending !== undefined) this.pendingCallSlots.delete(pending.slotKey);
			this.pendingCalls.delete(key);
			return false;
		}
		return true;
	}

	endFrame(): void {
		this.frame += 1;
		this.inboundFunctionCalls.clear();
		for (const [key, stored] of this.resultInbox) {
			if (stored.expiresFrame < this.frame) {
				this.resultInbox.delete(key);
				const pending = this.pendingCalls.get(key);
				if (pending !== undefined) this.pendingCallSlots.delete(pending.slotKey);
				this.pendingCalls.delete(key);
			}
		}
		for (const [key, pending] of this.pendingCalls) {
			if (pending.createdFrame + DEFAULT_PENDING_TTL_FRAMES < this.frame) {
				this.pendingCallSlots.delete(pending.slotKey);
				this.pendingCalls.delete(key);
			}
		}
	}

	encodeFunctionRequest(item: NetFunctionRequestOutboxItem): NetFunctionRequestEnvelope {
		return {
			callSiteId: item.handle.callSiteId,
			sequence: item.handle.sequence,
			payload: NetCodec.encodeFields(item.meta.fields, item.request),
		};
	}

	encodeFunctionResult(item: NetFunctionResultOutboxItem): NetFunctionResultEnvelope {
		const result = item.result;
		return result.ok
			? {
					callSiteId: item.call.handle.callSiteId,
					sequence: item.call.handle.sequence,
					ok: true,
					payload: NetCodec.encodeFields(item.call.meta.resultFields, result.value),
				}
			: {
					callSiteId: item.call.handle.callSiteId,
					sequence: item.call.handle.sequence,
					ok: false,
					error: result.error,
				};
	}

	private assertBoundary(expected: "client" | "server", method: string): void {
		if (this.boundary === "unknown") return;
		assert(this.boundary === expected, `[rovy-net] ${method} can only be called from the ${expected}.`);
	}

	private assertDirection(meta: NetEventReg, expected: NetEventDirection, source: string): void {
		assert(meta.direction === expected, `[rovy-net] ${meta.id} cannot be sent by ${source}; expected ${expected}.`);
	}

	private assertReceive(meta: NetEventReg, mode: NetEventReceiveMode): void {
		assert(
			meta.receive === mode,
			`[rovy-net] ${meta.id} has receive: "${meta.receive}", but net.${mode}(...) was used.`,
		);
	}
}

export class NetClient {
	constructor(private readonly runtime: NetRuntime) {}

	send<E extends ClientToServerNetEvent>(event: E): void {
		this.runtime.enqueueClient("send", event);
	}

	trigger<E extends ClientToServerNetEvent>(event: E): void {
		this.runtime.enqueueClient("trigger", event);
	}

	call<F extends ClientToServerNetFunction>(
		request: F,
		callSiteId = "runtime",
	): NetCallHandle<F> {
		return this.runtime.callFunction<F, object>(request, callSiteId);
	}

	getResult<F extends ClientToServerNetFunction, R extends object = object>(
		handle: NetCallHandle<F>,
	): NetFunctionCallResult<R> {
		return this.runtime.getFunctionResult<F, R>(handle);
	}

	hasResult<F extends ClientToServerNetFunction>(handle: NetCallHandle<F>): boolean {
		return this.runtime.hasFunctionResult(handle);
	}
}

export class NetFunc<F extends ClientToServerNetFunction = ClientToServerNetFunction, R extends object = object> {
	constructor(
		private readonly runtime: NetRuntime,
		private readonly functionId: string,
	) {}

	call(request: F, callSiteId = "runtime"): NetCallHandle<F> {
		return this.runtime.callFunction<F, R>(request, callSiteId, this.functionId);
	}

	getResult(handle: NetCallHandle<F>): NetFunctionCallResult<R> {
		if (handle.functionId !== this.functionId) return undefined;
		return this.runtime.getFunctionResult<F, R>(handle);
	}

	hasResult(handle: NetCallHandle<F>): boolean {
		if (handle.functionId !== this.functionId) return false;
		return this.runtime.hasFunctionResult(handle);
	}
}

export class NetServer {
	constructor(private readonly runtime: NetRuntime) {}

	send<E extends ServerToClientNetEvent>(player: Player, event: E): void {
		this.runtime.enqueueServer("send", { kind: "player", player }, event, "send");
	}

	trigger<E extends ServerToClientNetEvent>(player: Player, event: E): void {
		this.runtime.enqueueServer("trigger", { kind: "player", player }, event, "trigger");
	}

	broadcast<E extends ServerToClientNetEvent>(event: E): void {
		this.runtime.enqueueServer("send", { kind: "broadcast" }, event, "broadcast");
	}

	broadcastTrigger<E extends ServerToClientNetEvent>(event: E): void {
		this.runtime.enqueueServer("trigger", { kind: "broadcast" }, event, "broadcastTrigger");
	}

	sendList<E extends ServerToClientNetEvent>(players: ReadonlyArray<Player>, event: E): void {
		this.runtime.enqueueServer("send", { kind: "players", players }, event, "sendList");
	}

	triggerList<E extends ServerToClientNetEvent>(players: ReadonlyArray<Player>, event: E): void {
		this.runtime.enqueueServer("trigger", { kind: "players", players }, event, "triggerList");
	}

	broadcastExcept<E extends ServerToClientNetEvent>(except: Player, event: E): void {
		this.runtime.enqueueServer("send", { kind: "broadcastExcept", except }, event, "broadcastExcept");
	}

	broadcastTriggerExcept<E extends ServerToClientNetEvent>(except: Player, event: E): void {
		this.runtime.enqueueServer("trigger", { kind: "broadcastExcept", except }, event, "broadcastTriggerExcept");
	}
}

export class NetFunctionReader<F extends object = object> {
	constructor(
		private readonly runtime: NetRuntime,
		private readonly functionId: string,
	) {}

	forEach(cb: (call: NetFunctionCall<F>) => void): void {
		this.runtime.readFunctionCalls(this.functionId, cb as (call: NetFunctionCall) => void);
	}
}

export class NetFunctionResponder {
	constructor(private readonly runtime: NetRuntime) {}

	resolve<F extends object, R extends object>(call: NetFunctionCall<F>, result: R): void {
		this.runtime.enqueueFunctionResult(call, { ok: true, value: result });
	}

	reject(call: NetFunctionCall, message: string): void {
		this.runtime.enqueueFunctionResult(call, { ok: false, error: message });
	}
}

function resultKey(handle: NetCallHandleInternal): string {
	return `${handle.callSiteId}:${handle.sequence}`;
}

function functionSlotKey(functionId: string, callSiteId: string): string {
	return `${functionId}:${callSiteId}`;
}
