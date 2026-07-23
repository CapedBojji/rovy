import type { Commands } from "@rovy/core";
import { NetCodec } from "./codec";
import { rovyNet } from "./registry";
import type {
	ClientToServerNetEvent,
	ClientToServerNetFunction,
	NetCallHandle,
	NetEventDirection,
	NetEventReceiveMode,
	NetEventReg,
	NetFunctionCallResult,
	NetFunctionReg,
	NetFunctionRequestEnvelope,
	NetFunctionRequestOutboxItem,
	NetFunctionResult,
	NetFunctionResultEnvelope,
	NetOutboxItem,
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

export class NetClientRuntime {
	readonly client = new NetClient(this);
	private readonly metas = new Map<Ctor, NetEventReg>();
	private readonly functions = new Map<Ctor, NetFunctionReg>();
	private readonly outbox = new Array<NetOutboxItem>();
	private readonly functionRequestOutbox = new Array<NetFunctionRequestOutboxItem>();
	private readonly pendingCalls = new Map<string, PendingCall>();
	private readonly pendingCallSlots = new Map<string, string>();
	private readonly resultInbox = new Map<string, StoredResult>();
	private nextSequence = 0;
	private frame = 0;

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

	getBoundary(): "client" {
		return "client";
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

	functionParam<F extends ClientToServerNetFunction, R extends object>(functionId: string): NetFunc<F, R> {
		return new NetFunc(this, functionId);
	}

	enqueue(mode: NetEventReceiveMode, event: object): void {
		const meta = this.metaForEvent(event);
		this.assertDirection(meta, "clientToServer", "NetClient");
		this.assertReceive(meta, mode);
		this.outbox.push({ mode, event, meta, target: { kind: "server" } });
	}

	callFunction<F extends ClientToServerNetFunction, R extends object>(
		request: F,
		callSiteId: string,
		functionId?: string,
	): NetCallHandle<F> {
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
		const sequence = this.nextSequence++;
		const handle: NetCallHandleInternal = { functionId: meta.id, callSiteId, sequence, request };
		const key = resultKey(handle);
		this.pendingCalls.set(key, { handle, slotKey, createdFrame: this.frame });
		this.pendingCallSlots.set(slotKey, key);
		this.functionRequestOutbox.push({ request, meta, handle, target: { kind: "server" } });
		return handle as NetCallHandle<F>;
	}

	drainOutbox(): Array<NetOutboxItem> {
		const out = [...this.outbox];
		this.outbox.clear();
		return out;
	}

	drainFunctionRequestOutbox(): Array<NetFunctionRequestOutboxItem> {
		const out = [...this.functionRequestOutbox];
		this.functionRequestOutbox.clear();
		return out;
	}

	receive(event: object, commands: Pick<Commands, "send" | "trigger">, mode?: NetEventReceiveMode): void {
		const meta = this.metaForEvent(event);
		const receiveMode = mode ?? meta.receive;
		this.assertReceive(meta, receiveMode);
		if (receiveMode === "send") commands.send(event);
		else commands.trigger(event);
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

	getFunctionResult<F extends object, R extends object>(handle: NetCallHandle<F>): NetFunctionCallResult<R> {
		const internal = handle as NetCallHandleInternal;
		const key = resultKey(internal);
		const stored = this.resultInbox.get(key);
		if (stored === undefined) return undefined;
		if (stored.expiresFrame < this.frame) {
			this.removePending(key);
			return undefined;
		}
		this.resultInbox.delete(key);
		this.removePending(key);
		return stored.result.ok ? (stored.result.value as R) : stored.result;
	}

	hasFunctionResult<F extends object>(handle: NetCallHandle<F>): boolean {
		const key = resultKey(handle as NetCallHandleInternal);
		const stored = this.resultInbox.get(key);
		if (stored === undefined) return false;
		if (stored.expiresFrame < this.frame) {
			this.resultInbox.delete(key);
			this.removePending(key);
			return false;
		}
		return true;
	}

	endFrame(): void {
		this.frame += 1;
		for (const [key, stored] of this.resultInbox) {
			if (stored.expiresFrame < this.frame) {
				this.resultInbox.delete(key);
				this.removePending(key);
			}
		}
		for (const [key, pending] of this.pendingCalls) {
			if (pending.createdFrame + DEFAULT_PENDING_TTL_FRAMES < this.frame) this.removePending(key);
		}
	}

	encodeFunctionRequest(item: NetFunctionRequestOutboxItem): NetFunctionRequestEnvelope {
		return {
			callSiteId: item.handle.callSiteId,
			sequence: item.handle.sequence,
			payload: NetCodec.encodeFields(item.meta.fields, item.request),
		};
	}

	private removePending(key: string): void {
		const pending = this.pendingCalls.get(key);
		if (pending !== undefined) this.pendingCallSlots.delete(pending.slotKey);
		this.pendingCalls.delete(key);
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
	constructor(private readonly runtime: NetClientRuntime) {}

	send<E extends ClientToServerNetEvent>(event: E): void {
		this.runtime.enqueue("send", event);
	}

	trigger<E extends ClientToServerNetEvent>(event: E): void {
		this.runtime.enqueue("trigger", event);
	}

	call<F extends ClientToServerNetFunction>(request: F, callSiteId = "runtime"): NetCallHandle<F> {
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
		private readonly runtime: NetClientRuntime,
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
		return handle.functionId === this.functionId && this.runtime.hasFunctionResult(handle);
	}
}

function resultKey(handle: NetCallHandleInternal): string {
	return `${handle.callSiteId}:${handle.sequence}`;
}

function functionSlotKey(functionId: string, callSiteId: string): string {
	return `${functionId}:${callSiteId}`;
}
