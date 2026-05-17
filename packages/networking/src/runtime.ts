import type { Commands } from "@rovy/core";
import { NetEventContext } from "./context";
import { rovyNet } from "./registry";
import type {
	ClientToServerNetEvent,
	NetEventDirection,
	NetEventReceiveMode,
	NetEventReg,
	NetOutboxItem,
	NetTarget,
	RuntimeBoundary,
	ServerToClientNetEvent,
} from "./types";

type Ctor = NetEventReg["ctor"];

export class NetRuntime {
	readonly client = new NetClient(this);
	readonly server = new NetServer(this);
	readonly context = new NetEventContext();

	private readonly metas = new Map<Ctor, NetEventReg>();
	private readonly clientOutbox = new Array<NetOutboxItem>();
	private readonly serverOutbox = new Array<NetOutboxItem>();
	private boundary: RuntimeBoundary = "unknown";

	constructor(events: ReadonlyArray<NetEventReg> = rovyNet.registry) {
		for (const event of events) this.register(event);
	}

	register(meta: NetEventReg): void {
		this.metas.set(meta.ctor, meta);
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

	drainClientOutbox(): Array<NetOutboxItem> {
		const out = [...this.clientOutbox];
		this.clientOutbox.clear();
		return out;
	}

	drainServerOutbox(): Array<NetOutboxItem> {
		const out = [...this.serverOutbox];
		this.serverOutbox.clear();
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
