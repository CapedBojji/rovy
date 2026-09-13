import type { NetPayload } from "./codec";
import type { NetTransport, NetTransportContext } from "./transport";
import type {
	NetFunctionRequestEnvelope,
	NetFunctionRequestOutboxItem,
	NetFunctionResultEnvelope,
	NetFunctionResultOutboxItem,
	NetOutboxItem,
} from "./types";

const FOLDER_NAME = "RovyNetworking";
const FUNCTION_REQUEST_TAG = "__rovy_fn_req";
const FUNCTION_RESULT_TAG = "__rovy_fn_res";
const REMOTES: Record<"c2s" | "s2c", Record<"reliable" | "unreliable", string>> = {
	c2s: { reliable: "ReliableClientToServer", unreliable: "UnreliableClientToServer" },
	s2c: { reliable: "ReliableServerToClient", unreliable: "UnreliableServerToClient" },
};

type ClientInbound =
	| { kind: "event"; name: string; payload: NetPayload }
	| { kind: "functionResult"; name: string; envelope: NetFunctionResultEnvelope };

type ServerInbound =
	| { kind: "event"; name: string; payload: NetPayload; sender: Player }
	| { kind: "functionRequest"; name: string; envelope: NetFunctionRequestEnvelope; sender: Player };

export class ClientRemoteEventTransport implements NetTransport {
	private ctx?: NetTransportContext;
	private readonly inbound = new Array<ClientInbound>();
	private send_ = (_item: NetOutboxItem, _payload: NetPayload): void => {};
	private sendFunctionRequest_ = (
		_item: NetFunctionRequestOutboxItem,
		_envelope: NetFunctionRequestEnvelope,
	): void => {};

	start(ctx: NetTransportContext): void {
		assert(ctx.boundary === "client", "[rovy-net] ClientRemoteEventTransport requires the client boundary");
		this.ctx = ctx;
		const [ok, rs] = pcall(() => game.GetService("ReplicatedStorage"));
		if (!ok || rs === undefined) return;
		const folder = rs.WaitForChild(FOLDER_NAME) as Folder;
		const reliableOut = folder.WaitForChild(REMOTES.c2s.reliable) as RemoteEvent;
		const unreliableOut = folder.WaitForChild(REMOTES.c2s.unreliable) as RemoteEvent;
		const reliableIn = folder.WaitForChild(REMOTES.s2c.reliable) as RemoteEvent;
		const unreliableIn = folder.WaitForChild(REMOTES.s2c.unreliable) as RemoteEvent;
		const onClient = (...args: Array<unknown>) => {
			const tagOrName = args[0] as string;
			if (tagOrName === FUNCTION_RESULT_TAG) {
				this.inbound.push({
					kind: "functionResult",
					name: args[1] as string,
					envelope: args[2] as NetFunctionResultEnvelope,
				});
			} else {
				this.inbound.push({ kind: "event", name: tagOrName, payload: args[1] as NetPayload });
			}
		};
		reliableIn.OnClientEvent.Connect(onClient);
		unreliableIn.OnClientEvent.Connect(onClient);
		this.send_ = (item, payload) => {
			const remote = item.meta.channel === "unreliable" ? unreliableOut : reliableOut;
			remote.FireServer(item.meta.name, payload);
		};
		this.sendFunctionRequest_ = (item, envelope) => {
			reliableOut.FireServer(FUNCTION_REQUEST_TAG, item.meta.name, envelope);
		};
	}

	send(item: NetOutboxItem, payload: NetPayload): void {
		this.send_(item, payload);
	}
	sendFunctionRequest(item: NetFunctionRequestOutboxItem, envelope: NetFunctionRequestEnvelope): void {
		this.sendFunctionRequest_(item, envelope);
	}
	sendFunctionResult(_item: NetFunctionResultOutboxItem, _envelope: NetFunctionResultEnvelope): void {}
	pump(): void {
		const ctx = this.ctx;
		if (ctx === undefined) return;
		for (const message of this.inbound) {
			if (message.kind === "event") ctx.deliver(message.name, message.payload);
			else ctx.deliverFunctionResult?.(message.name, message.envelope);
		}
		this.inbound.clear();
	}
}

export class ServerRemoteEventTransport implements NetTransport {
	private ctx?: NetTransportContext;
	private inbound = new Array<ServerInbound>();
	/** Number of newest messages dropped at capacity during this transport lifetime. */
	droppedInbound = 0;

	/** Maximum queued inbound messages; overflow drops newest. Defaults to unlimited. */
	constructor(private readonly maxInboundMessages = math.huge) {
		assert(maxInboundMessages > 0, "[rovy-net] Inbound capacity must be positive");
	}
	private send_ = (_item: NetOutboxItem, _payload: NetPayload): void => {};
	private sendFunctionResult_ = (
		_item: NetFunctionResultOutboxItem,
		_envelope: NetFunctionResultEnvelope,
	): void => {};

	start(ctx: NetTransportContext): void {
		assert(ctx.boundary === "server", "[rovy-net] ServerRemoteEventTransport requires the server boundary");
		this.ctx = ctx;
		const [ok, rs] = pcall(() => game.GetService("ReplicatedStorage"));
		if (!ok || rs === undefined) return;
		const folder = ensureFolder(rs);
		const reliableIn = ensureRemote(folder, REMOTES.c2s.reliable);
		const unreliableIn = ensureRemote(folder, REMOTES.c2s.unreliable);
		const reliableOut = ensureRemote(folder, REMOTES.s2c.reliable);
		const unreliableOut = ensureRemote(folder, REMOTES.s2c.unreliable);
		const onServer = (player: Player, ...args: Array<unknown>) => {
			if (this.inbound.size() >= this.maxInboundMessages) {
				this.droppedInbound += 1;
				return;
			}
			if (!typeIs(args[0], "string")) return;
			const tagOrName = args[0] as string;
			if (tagOrName === FUNCTION_REQUEST_TAG) {
				if (!typeIs(args[1], "string") || !typeIs(args[2], "table")) return;
				this.inbound.push({
					kind: "functionRequest",
					name: args[1] as string,
					envelope: args[2] as NetFunctionRequestEnvelope,
					sender: player,
				});
			} else {
				if (!typeIs(args[1], "table")) return;
				this.inbound.push({ kind: "event", name: tagOrName, payload: args[1] as NetPayload, sender: player });
			}
		};
		reliableIn.OnServerEvent.Connect(onServer);
		unreliableIn.OnServerEvent.Connect(onServer);
		this.send_ = (item, payload) => {
			const remote = item.meta.channel === "unreliable" ? unreliableOut : reliableOut;
			dispatchServer(remote, item, payload);
		};
		this.sendFunctionResult_ = (item, envelope) => {
			reliableOut.FireClient(item.target.player, FUNCTION_RESULT_TAG, item.call.meta.name, envelope);
		};
	}

	send(item: NetOutboxItem, payload: NetPayload): void {
		this.send_(item, payload);
	}
	sendFunctionRequest(_item: NetFunctionRequestOutboxItem, _envelope: NetFunctionRequestEnvelope): void {}
	sendFunctionResult(item: NetFunctionResultOutboxItem, envelope: NetFunctionResultEnvelope): void {
		this.sendFunctionResult_(item, envelope);
	}
	pump(): void {
		const ctx = this.ctx;
		if (ctx === undefined) return;
		// Detach before delivery so failures cannot replay this batch.
		const inbound = this.inbound;
		this.inbound = [];
		for (const message of inbound) {
			const [ok, problem] = pcall(() => {
				if (message.kind === "event") ctx.deliver(message.name, message.payload, message.sender);
				else ctx.deliverFunctionRequest?.(message.name, message.envelope, message.sender);
			});
			if (!ok) warn(`[rovy-net] Discarded failed inbound message: ${tostring(problem)}`);
		}
	}
}

function dispatchServer(remote: RemoteEvent, item: NetOutboxItem, payload: NetPayload): void {
	const name = item.meta.name;
	const target = item.target;
	switch (target.kind) {
		case "player":
			remote.FireClient(target.player, name, payload);
			break;
		case "players":
			for (const player of target.players) remote.FireClient(player, name, payload);
			break;
		case "broadcast":
			remote.FireAllClients(name, payload);
			break;
		case "broadcastExcept":
			for (const player of game.GetService("Players").GetPlayers()) {
				if (player !== target.except) remote.FireClient(player, name, payload);
			}
			break;
		case "server":
			break;
	}
}

function ensureFolder(rs: ReplicatedStorage): Folder {
	const existing = rs.FindFirstChild(FOLDER_NAME);
	if (existing && existing.IsA("Folder")) return existing;
	const folder = new Instance("Folder");
	folder.Name = FOLDER_NAME;
	folder.Parent = rs;
	return folder;
}

function ensureRemote(folder: Folder, name: string): RemoteEvent {
	const existing = folder.FindFirstChild(name);
	if (existing && existing.IsA("RemoteEvent")) return existing;
	const remote = new Instance("RemoteEvent");
	remote.Name = name;
	remote.Parent = folder;
	return remote;
}
