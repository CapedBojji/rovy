import type { Ctor } from "@rovy/core";

export type NetId = number;
export type NetEventDirection = "clientToServer" | "serverToClient";
export type NetEventChannel = "reliable" | "unreliable";
export type NetEventReceiveMode = "send" | "trigger";
export type ClientToServerNetEvent = object;
export type ServerToClientNetEvent = object;

export const NET_CLIENT_PARAM = "@rovy/networking/NetClient";
export const NET_SERVER_PARAM = "@rovy/networking/NetServer";
export const NET_EVENT_CONTEXT_PARAM = "@rovy/networking/NetEventContext";
export const NET_RUNTIME_PARAM = "@rovy/networking/NetRuntime";

export interface NetEventOptions {
	direction: NetEventDirection;
	channel?: NetEventChannel;
	receive?: NetEventReceiveMode;
}

export interface NetRuntimeConfig {
	readonly transport: "blink" | "remote";
	readonly strictBoundaryChecks: boolean;
}

export interface NetEventReg {
	readonly ctor: Ctor;
	readonly id: string;
	/** Class name — also the Blink/RemoteEvent wire name. */
	readonly name: string;
	readonly direction: NetEventDirection;
	readonly channel: NetEventChannel;
	readonly receive: NetEventReceiveMode;
	/** Constructor parameter names, in declaration order (for generic codec). */
	readonly fields: ReadonlyArray<string>;
	readonly blink?: string;
}

export type RuntimeBoundary = "client" | "server" | "unknown";

export type NetTarget =
	| { readonly kind: "server" }
	| { readonly kind: "player"; readonly player: Player }
	| { readonly kind: "players"; readonly players: ReadonlyArray<Player> }
	| { readonly kind: "broadcast" }
	| { readonly kind: "broadcastExcept"; readonly except: Player };

export interface NetOutboxItem {
	readonly mode: NetEventReceiveMode;
	readonly event: object;
	readonly meta: NetEventReg;
	readonly target: NetTarget;
}

/** Decoded inbound message handed back by a transport's poll(). */
export interface NetInboundItem {
	readonly meta: NetEventReg;
	readonly event: object;
	/** Roblox player for client→server messages; undefined on the client. */
	readonly sender?: Player;
}
