import type { NetPayload } from "./codec";
import type { NetTransport, NetTransportContext } from "./transport";
import type { NetOutboxItem } from "./types";

const FOLDER_NAME = "RovyNetworking";
const REMOTES: Record<"c2s" | "s2c", Record<"reliable" | "unreliable", string>> = {
	c2s: { reliable: "ReliableClientToServer", unreliable: "UnreliableClientToServer" },
	s2c: { reliable: "ReliableServerToClient", unreliable: "UnreliableServerToClient" },
};

type InboundMessage = { name: string; payload: NetPayload; sender?: Player };

/**
 * Zero-codegen transport over a small fixed RemoteEvent set. Inbound Roblox
 * signals are buffered into a queue so delivery happens on `pump()` (matching
 * the poll model) rather than reentrantly inside the signal.
 */
export class RemoteEventTransport implements NetTransport {
	private ctx?: NetTransportContext;
	private readonly inbound = new Array<InboundMessage>();
	private send_!: (item: NetOutboxItem, payload: NetPayload) => void;

	start(ctx: NetTransportContext): void {
		this.ctx = ctx;
		if (ctx.boundary === "unknown") {
			this.send_ = () => {};
			return;
		}
		const [ok, rs] = pcall(() => game.GetService("ReplicatedStorage"));
		if (!ok || rs === undefined) {
			this.send_ = () => {};
			return;
		}

		if (ctx.boundary === "server") {
			const folder = ensureFolder(rs);
			const reliableIn = ensureRemote(folder, REMOTES.c2s.reliable);
			const unreliableIn = ensureRemote(folder, REMOTES.c2s.unreliable);
			const reliableOut = ensureRemote(folder, REMOTES.s2c.reliable);
			const unreliableOut = ensureRemote(folder, REMOTES.s2c.unreliable);

			const onServer = (player: Player, ...args: Array<unknown>) => {
				this.inbound.push({ name: args[0] as string, payload: args[1] as NetPayload, sender: player });
			};
			reliableIn.OnServerEvent.Connect(onServer);
			unreliableIn.OnServerEvent.Connect(onServer);

			this.send_ = (item, payload) => {
				const remote = item.meta.channel === "unreliable" ? unreliableOut : reliableOut;
				dispatchServer(remote, item, payload);
			};
			return;
		}

		const folder = rs.WaitForChild(FOLDER_NAME) as Folder;
		const reliableOut = folder.WaitForChild(REMOTES.c2s.reliable) as RemoteEvent;
		const unreliableOut = folder.WaitForChild(REMOTES.c2s.unreliable) as RemoteEvent;
		const reliableIn = folder.WaitForChild(REMOTES.s2c.reliable) as RemoteEvent;
		const unreliableIn = folder.WaitForChild(REMOTES.s2c.unreliable) as RemoteEvent;

		const onClient = (...args: Array<unknown>) => {
			this.inbound.push({ name: args[0] as string, payload: args[1] as NetPayload });
		};
		reliableIn.OnClientEvent.Connect(onClient);
		unreliableIn.OnClientEvent.Connect(onClient);

		this.send_ = (item, payload) => {
			const remote = item.meta.channel === "unreliable" ? unreliableOut : reliableOut;
			remote.FireServer(item.meta.name, payload);
		};
	}

	send(item: NetOutboxItem, payload: NetPayload): void {
		this.send_(item, payload);
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
