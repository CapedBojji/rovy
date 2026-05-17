import type { NetCodec, NetPayload } from "./codec";
import type { NetOutboxItem, RuntimeBoundary } from "./types";

/** Decoded inbound delivery callback wired by the plugin. */
export type NetDeliver = (name: string, payload: NetPayload, sender?: Player) => void;

export interface NetTransportContext {
	readonly boundary: RuntimeBoundary;
	readonly deliver: NetDeliver;
}

/**
 * Transport boundary. A transport owns the wire (RemoteEvent, Blink, or an
 * in-process loopback); it never touches the ECS. `pump()` drains anything the
 * transport buffered between ticks; `send()` dispatches one outbox item.
 */
export interface NetTransport {
	start(ctx: NetTransportContext): void;
	send(item: NetOutboxItem, payload: NetPayload): void;
	/** Push transport-buffered inbound messages through `deliver`. */
	pump(): void;
	/** Reliable transports may batch; called once after a flush pass. */
	commit?(): void;
}

/**
 * In-process loopback. Two instances cross-linked deliver client↔server
 * without Roblox. Used by the test suite and as a deterministic default in
 * headless harnesses.
 */
export class LoopbackTransport implements NetTransport {
	private ctx?: NetTransportContext;
	private peer?: LoopbackTransport;
	private readonly inbound = new Array<{ name: string; payload: NetPayload; sender?: Player }>();
	/** Every item this side dispatched, for assertions. */
	readonly sent = new Array<{ item: NetOutboxItem; payload: NetPayload }>();

	constructor(private readonly senderForClient?: Player) {}

	link(peer: LoopbackTransport): void {
		this.peer = peer;
		peer.peer = this;
	}

	start(ctx: NetTransportContext): void {
		this.ctx = ctx;
	}

	send(item: NetOutboxItem, payload: NetPayload): void {
		this.sent.push({ item, payload });
		const peer = this.peer;
		if (peer === undefined) return;
		// client→server carries this side's player identity; server→client none.
		const sender = this.ctx?.boundary === "client" ? this.senderForClient : undefined;
		peer.inbound.push({ name: item.meta.name, payload, sender });
	}

	pump(): void {
		const ctx = this.ctx;
		if (ctx === undefined) return;
		for (const message of this.inbound) {
			ctx.deliver(message.name, message.payload, message.sender);
		}
		this.inbound.clear();
	}
}

/** Pair two loopback transports for a full client↔server round-trip test. */
export function connectLoopback(
	client: LoopbackTransport,
	server: LoopbackTransport,
): void {
	client.link(server);
}

export { type NetCodec };
