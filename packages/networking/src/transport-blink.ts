import type { NetPayload } from "./codec";
import type { NetTransport, NetTransportContext } from "./transport";
import type { NetEventReg, NetOutboxItem } from "./types";

/**
 * Shape of one generated Blink polling event. Blink emits `Casing = Pascal`
 * names matching the `@netEvent` class, so `module[reg.name]` resolves.
 */
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

/**
 * Adapter over a Blink-generated polling module. The transformer already emits
 * a per-event Blink schema; once that schema is compiled to a module, pass it
 * via `NetPlugin({ blink })` to use the binary transport instead of
 * RemoteEvents.
 */
export class BlinkTransport implements NetTransport {
	private ctx?: NetTransportContext;

	constructor(
		private readonly module: BlinkModule,
		private readonly events: ReadonlyArray<NetEventReg>,
	) {}

	start(ctx: NetTransportContext): void {
		this.ctx = ctx;
	}

	send(item: NetOutboxItem, payload: NetPayload): void {
		const blinkEvent = this.module[item.meta.name] as BlinkEvent | undefined;
		assert(blinkEvent !== undefined, `[rovy-net] Blink module missing event '${item.meta.name}'`);
		const target = item.target;
		if (this.ctx?.boundary === "client") {
			blinkEvent.Fire(payload);
			return;
		}
		switch (target.kind) {
			case "player":
				blinkEvent.Fire(target.player, payload);
				break;
			case "players":
				assert(blinkEvent.FireList !== undefined, "[rovy-net] Blink event missing FireList");
				blinkEvent.FireList(target.players, payload);
				break;
			case "broadcast":
				assert(blinkEvent.FireAll !== undefined, "[rovy-net] Blink event missing FireAll");
				blinkEvent.FireAll(payload);
				break;
			case "broadcastExcept":
				assert(blinkEvent.FireExcept !== undefined, "[rovy-net] Blink event missing FireExcept");
				blinkEvent.FireExcept(target.except, payload);
				break;
			case "server":
				break;
		}
	}

	pump(): void {
		const ctx = this.ctx;
		if (ctx === undefined) return;
		const inboundDirection = ctx.boundary === "server" ? "clientToServer" : "serverToClient";
		for (const meta of this.events) {
			if (meta.direction !== inboundDirection) continue;
			const blinkEvent = this.module[meta.name] as BlinkEvent | undefined;
			if (blinkEvent === undefined) continue;
			if (ctx.boundary === "server") {
				for (const [, player, data] of blinkEvent.Iter()) {
					ctx.deliver(meta.name, data as NetPayload, player as Player);
				}
			} else {
				for (const [, data] of blinkEvent.Iter()) {
					ctx.deliver(meta.name, data as NetPayload);
				}
			}
		}
	}

	commit(): void {
		this.module.StepReplication?.();
	}
}
