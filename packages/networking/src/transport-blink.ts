import type { NetPayload } from "./codec";
import type { NetTransport, NetTransportContext } from "./transport";
import type {
	NetEventReg,
	NetFunctionReg,
	NetFunctionRequestEnvelope,
	NetFunctionRequestOutboxItem,
	NetFunctionResultEnvelope,
	NetFunctionResultOutboxItem,
	NetOutboxItem,
} from "./types";

export interface BlinkEvent {
	Fire(this: void, ...args: Array<unknown>): void;
	FireAll?(this: void, data: unknown): void;
	FireList?(this: void, players: ReadonlyArray<Player>, data: unknown): void;
	FireExcept?(this: void, except: Player, data: unknown): void;
	Iter(this: void): IterableFunction<LuaTuple<[number, unknown, unknown]>>;
}

export interface BlinkModule {
	[event: string]: unknown;
	StepReplication?(this: void): void;
}

export class ClientBlinkTransport implements NetTransport {
	private ctx?: NetTransportContext;
	constructor(
		private readonly module: BlinkModule,
		private readonly events: ReadonlyArray<NetEventReg>,
		private readonly functions: ReadonlyArray<NetFunctionReg> = [],
	) {}
	start(ctx: NetTransportContext): void {
		assert(ctx.boundary === "client", "[rovy-net] ClientBlinkTransport requires the client boundary");
		this.ctx = ctx;
	}
	send(item: NetOutboxItem, payload: NetPayload): void {
		const event = this.event(item.meta.name);
		event.Fire(payload);
	}
	sendFunctionRequest(item: NetFunctionRequestOutboxItem, envelope: NetFunctionRequestEnvelope): void {
		this.event(item.meta.requestName).Fire(envelope);
	}
	sendFunctionResult(_item: NetFunctionResultOutboxItem, _envelope: NetFunctionResultEnvelope): void {}
	pump(): void {
		const ctx = this.ctx;
		if (ctx === undefined) return;
		for (const meta of this.events) {
			if (meta.direction !== "serverToClient") continue;
			const event = this.module[meta.name] as BlinkEvent | undefined;
			if (event === undefined) continue;
			for (const [, data] of event.Iter()) ctx.deliver(meta.name, data as NetPayload);
		}
		for (const meta of this.functions) {
			const event = this.module[meta.resultWireName] as BlinkEvent | undefined;
			if (event === undefined) continue;
			for (const [, data] of event.Iter()) {
				ctx.deliverFunctionResult?.(meta.name, data as NetFunctionResultEnvelope);
			}
		}
	}
	commit(): void {
		this.module.StepReplication?.();
	}
	private event(name: string): BlinkEvent {
		const event = this.module[name] as BlinkEvent | undefined;
		assert(event !== undefined, `[rovy-net] Blink module missing event '${name}'`);
		return event;
	}
}

export class ServerBlinkTransport implements NetTransport {
	private ctx?: NetTransportContext;
	constructor(
		private readonly module: BlinkModule,
		private readonly events: ReadonlyArray<NetEventReg>,
		private readonly functions: ReadonlyArray<NetFunctionReg> = [],
	) {}
	start(ctx: NetTransportContext): void {
		assert(ctx.boundary === "server", "[rovy-net] ServerBlinkTransport requires the server boundary");
		this.ctx = ctx;
	}
	send(item: NetOutboxItem, payload: NetPayload): void {
		const event = this.event(item.meta.name);
		switch (item.target.kind) {
			case "player":
				event.Fire(item.target.player, payload);
				break;
			case "players":
				assert(event.FireList !== undefined, "[rovy-net] Blink event missing FireList");
				event.FireList(item.target.players, payload);
				break;
			case "broadcast":
				assert(event.FireAll !== undefined, "[rovy-net] Blink event missing FireAll");
				event.FireAll(payload);
				break;
			case "broadcastExcept":
				assert(event.FireExcept !== undefined, "[rovy-net] Blink event missing FireExcept");
				event.FireExcept(item.target.except, payload);
				break;
			case "server":
				break;
		}
	}
	sendFunctionRequest(_item: NetFunctionRequestOutboxItem, _envelope: NetFunctionRequestEnvelope): void {}
	sendFunctionResult(item: NetFunctionResultOutboxItem, envelope: NetFunctionResultEnvelope): void {
		this.event(item.call.meta.resultWireName).Fire(item.target.player, envelope);
	}
	pump(): void {
		const ctx = this.ctx;
		if (ctx === undefined) return;
		for (const meta of this.events) {
			if (meta.direction !== "clientToServer") continue;
			const event = this.module[meta.name] as BlinkEvent | undefined;
			if (event === undefined) continue;
			for (const [, player, data] of event.Iter()) {
				ctx.deliver(meta.name, data as NetPayload, player as Player);
			}
		}
		for (const meta of this.functions) {
			const event = this.module[meta.requestName] as BlinkEvent | undefined;
			if (event === undefined) continue;
			for (const [, player, data] of event.Iter()) {
				ctx.deliverFunctionRequest?.(meta.name, data as NetFunctionRequestEnvelope, player as Player);
			}
		}
	}
	commit(): void {
		this.module.StepReplication?.();
	}
	private event(name: string): BlinkEvent {
		const event = this.module[name] as BlinkEvent | undefined;
		assert(event !== undefined, `[rovy-net] Blink module missing event '${name}'`);
		return event;
	}
}
