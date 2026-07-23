import type { NetPayload } from "./codec";
import { requireNetBoundaryProvider } from "./provider";
import type { BlinkModule } from "./transport-blink";
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

/** @deprecated Use ClientRemoteEventTransport or ServerRemoteEventTransport. */
export class RemoteEventTransport implements NetTransport {
	private readonly delegate = requireNetBoundaryProvider().createRemoteTransport();
	start(ctx: NetTransportContext): void {
		this.delegate.start(ctx);
	}
	send(item: NetOutboxItem, payload: NetPayload): void {
		this.delegate.send(item, payload);
	}
	sendFunctionRequest(item: NetFunctionRequestOutboxItem, envelope: NetFunctionRequestEnvelope): void {
		this.delegate.sendFunctionRequest(item, envelope);
	}
	sendFunctionResult(item: NetFunctionResultOutboxItem, envelope: NetFunctionResultEnvelope): void {
		this.delegate.sendFunctionResult(item, envelope);
	}
	pump(): void {
		this.delegate.pump();
	}
	commit(): void {
		this.delegate.commit?.();
	}
}

/** @deprecated Use ClientBlinkTransport or ServerBlinkTransport. */
export class BlinkTransport implements NetTransport {
	private readonly delegate: NetTransport;
	constructor(
		module: BlinkModule,
		events: ReadonlyArray<NetEventReg>,
		functions: ReadonlyArray<NetFunctionReg> = [],
	) {
		this.delegate = requireNetBoundaryProvider().createBlinkTransport(module, events, functions);
	}
	start(ctx: NetTransportContext): void {
		this.delegate.start(ctx);
	}
	send(item: NetOutboxItem, payload: NetPayload): void {
		this.delegate.send(item, payload);
	}
	sendFunctionRequest(item: NetFunctionRequestOutboxItem, envelope: NetFunctionRequestEnvelope): void {
		this.delegate.sendFunctionRequest(item, envelope);
	}
	sendFunctionResult(item: NetFunctionResultOutboxItem, envelope: NetFunctionResultEnvelope): void {
		this.delegate.sendFunctionResult(item, envelope);
	}
	pump(): void {
		this.delegate.pump();
	}
	commit(): void {
		this.delegate.commit?.();
	}
}
