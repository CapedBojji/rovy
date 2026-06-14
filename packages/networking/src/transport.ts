import type { NetCodec, NetPayload } from "./codec";
import type {
	NetFunctionReg,
	NetFunctionRequestEnvelope,
	NetFunctionRequestOutboxItem,
	NetFunctionResultEnvelope,
	NetFunctionResultOutboxItem,
	NetOutboxItem,
	RuntimeBoundary,
} from "./types";

/** Decoded inbound delivery callback wired by the plugin. */
export type NetDeliver = (name: string, payload: NetPayload, sender?: Player) => void;
export type NetFunctionRequestDeliver = (
	name: string,
	envelope: NetFunctionRequestEnvelope,
	sender?: Player,
) => void;
export type NetFunctionResultDeliver = (name: string, envelope: NetFunctionResultEnvelope) => void;

export interface NetTransportContext {
	readonly boundary: RuntimeBoundary;
	readonly deliver: NetDeliver;
	readonly deliverFunctionRequest?: NetFunctionRequestDeliver;
	readonly deliverFunctionResult?: NetFunctionResultDeliver;
}

/**
 * Transport boundary. A transport owns the wire (RemoteEvent, Blink, or an
 * in-process loopback); it never touches the ECS. `pump()` drains anything the
 * transport buffered between ticks; `send()` dispatches one outbox item.
 */
export interface NetTransport {
	start(ctx: NetTransportContext): void;
	send(item: NetOutboxItem, payload: NetPayload): void;
	sendFunctionRequest(item: NetFunctionRequestOutboxItem, envelope: NetFunctionRequestEnvelope): void;
	sendFunctionResult(item: NetFunctionResultOutboxItem, envelope: NetFunctionResultEnvelope): void;
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
	private readonly inbound = new Array<
		| { kind: "event"; name: string; payload: NetPayload; sender?: Player }
		| { kind: "functionRequest"; name: string; envelope: NetFunctionRequestEnvelope; sender?: Player }
		| { kind: "functionResult"; name: string; envelope: NetFunctionResultEnvelope }
	>();
	/** Every item this side dispatched, for assertions. */
	readonly sent = new Array<{ item: NetOutboxItem; payload: NetPayload }>();
	readonly sentFunctionRequests = new Array<{ item: NetFunctionRequestOutboxItem; envelope: NetFunctionRequestEnvelope }>();
	readonly sentFunctionResults = new Array<{ item: NetFunctionResultOutboxItem; envelope: NetFunctionResultEnvelope }>();

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
		peer.inbound.push({ kind: "event", name: item.meta.name, payload, sender });
	}

	sendFunctionRequest(item: NetFunctionRequestOutboxItem, envelope: NetFunctionRequestEnvelope): void {
		this.sentFunctionRequests.push({ item, envelope });
		const peer = this.peer;
		if (peer === undefined) return;
		const sender = this.ctx?.boundary === "client" ? this.senderForClient : undefined;
		peer.inbound.push({ kind: "functionRequest", name: item.meta.name, envelope, sender });
	}

	sendFunctionResult(item: NetFunctionResultOutboxItem, envelope: NetFunctionResultEnvelope): void {
		this.sentFunctionResults.push({ item, envelope });
		const peer = this.peer;
		if (peer === undefined) return;
		peer.inbound.push({ kind: "functionResult", name: item.call.meta.name, envelope });
	}

	pump(): void {
		const ctx = this.ctx;
		if (ctx === undefined) return;
		for (const message of this.inbound) {
			if (message.kind === "event") ctx.deliver(message.name, message.payload, message.sender);
			else if (message.kind === "functionRequest") {
				ctx.deliverFunctionRequest?.(message.name, message.envelope, message.sender);
			} else {
				ctx.deliverFunctionResult?.(message.name, message.envelope);
			}
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
