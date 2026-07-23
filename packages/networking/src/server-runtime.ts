import type { Commands } from "@rovy/core";
import { NetCodec } from "./codec";
import { NetEventContext } from "./context";
import { rovyNet } from "./registry";
import type {
	ClientToServerNetFunction,
	NetEventDirection,
	NetEventReceiveMode,
	NetEventReg,
	NetFunctionCall,
	NetFunctionReg,
	NetFunctionRequestEnvelope,
	NetFunctionResult,
	NetFunctionResultEnvelope,
	NetFunctionResultOutboxItem,
	NetOutboxItem,
	NetTarget,
	ServerToClientNetEvent,
} from "./types";

type Ctor = NetEventReg["ctor"];

export class NetServerRuntime {
	readonly server = new NetServer(this);
	readonly context = new NetEventContext();
	readonly responder = new NetFunctionResponder(this);
	private readonly metas = new Map<Ctor, NetEventReg>();
	private readonly functions = new Map<Ctor, NetFunctionReg>();
	private readonly outbox = new Array<NetOutboxItem>();
	private readonly functionResultOutbox = new Array<NetFunctionResultOutboxItem>();
	private readonly inboundFunctionCalls = new Map<string, Array<NetFunctionCall>>();

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

	getBoundary(): "server" {
		return "server";
	}

	metaForEvent(event: object): NetEventReg {
		const ctor = getmetatable(event) as unknown as Ctor | undefined;
		const meta = ctor !== undefined ? this.metas.get(ctor) : undefined;
		assert(meta !== undefined, `[rovy-net] event is not registered with @netEvent: ${tostring(ctor)}`);
		return meta;
	}

	functionReader<F extends object>(functionId: string): NetFunctionReader<F> {
		return new NetFunctionReader(this, functionId);
	}

	enqueue(mode: NetEventReceiveMode, target: NetTarget, event: object, method: string): void {
		const meta = this.metaForEvent(event);
		this.assertDirection(meta, "serverToClient", "NetServer");
		this.assertReceive(meta, mode);
		this.outbox.push({ mode, event, meta, target });
	}

	enqueueFunctionResult<R extends object>(call: NetFunctionCall, result: NetFunctionResult<R>): void {
		const player = call.sender;
		assert(player !== undefined, `[rovy-net] cannot respond to ${call.meta.id}; missing sender.`);
		this.functionResultOutbox.push({
			call,
			result: result as NetFunctionResult,
			target: { kind: "player", player },
		});
	}

	drainOutbox(): Array<NetOutboxItem> {
		const out = [...this.outbox];
		this.outbox.clear();
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

	readFunctionCalls(functionId: string, cb: (call: NetFunctionCall) => void): void {
		for (const call of this.inboundFunctionCalls.get(functionId) ?? []) cb(call);
	}

	endFrame(): void {
		this.inboundFunctionCalls.clear();
		this.context.clear();
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

export class NetServer {
	constructor(private readonly runtime: NetServerRuntime) {}

	send<E extends ServerToClientNetEvent>(player: Player, event: E): void {
		this.runtime.enqueue("send", { kind: "player", player }, event, "send");
	}
	trigger<E extends ServerToClientNetEvent>(player: Player, event: E): void {
		this.runtime.enqueue("trigger", { kind: "player", player }, event, "trigger");
	}
	broadcast<E extends ServerToClientNetEvent>(event: E): void {
		this.runtime.enqueue("send", { kind: "broadcast" }, event, "broadcast");
	}
	broadcastTrigger<E extends ServerToClientNetEvent>(event: E): void {
		this.runtime.enqueue("trigger", { kind: "broadcast" }, event, "broadcastTrigger");
	}
	sendList<E extends ServerToClientNetEvent>(players: ReadonlyArray<Player>, event: E): void {
		this.runtime.enqueue("send", { kind: "players", players }, event, "sendList");
	}
	triggerList<E extends ServerToClientNetEvent>(players: ReadonlyArray<Player>, event: E): void {
		this.runtime.enqueue("trigger", { kind: "players", players }, event, "triggerList");
	}
	broadcastExcept<E extends ServerToClientNetEvent>(except: Player, event: E): void {
		this.runtime.enqueue("send", { kind: "broadcastExcept", except }, event, "broadcastExcept");
	}
	broadcastTriggerExcept<E extends ServerToClientNetEvent>(except: Player, event: E): void {
		this.runtime.enqueue("trigger", { kind: "broadcastExcept", except }, event, "broadcastTriggerExcept");
	}
}

export class NetFunctionReader<F extends object = object> {
	constructor(
		private readonly runtime: NetServerRuntime,
		private readonly functionId: string,
	) {}
	forEach(cb: (call: NetFunctionCall<F>) => void): void {
		this.runtime.readFunctionCalls(this.functionId, cb as (call: NetFunctionCall) => void);
	}
}

export class NetFunctionResponder {
	constructor(private readonly runtime: NetServerRuntime) {}
	resolve<F extends object, R extends object>(call: NetFunctionCall<F>, result: R): void {
		this.runtime.enqueueFunctionResult(call, { ok: true, value: result });
	}
	reject(call: NetFunctionCall, message: string): void {
		this.runtime.enqueueFunctionResult(call, { ok: false, error: message });
	}
}
