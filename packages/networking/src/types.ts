import type { Ctor } from "@rovy/core";

export type NetId = number;
export type NetEventDirection = "clientToServer" | "serverToClient";
export type NetEventChannel = "reliable" | "unreliable";
export type NetEventReceiveMode = "send" | "trigger";
export type ClientToServerNetEvent = object;
export type ServerToClientNetEvent = object;
export type ClientToServerNetFunction = object;

export const NET_CLIENT_PARAM = "@rovy/networking/NetClient";
export const NET_SERVER_PARAM = "@rovy/networking/NetServer";
export const NET_EVENT_CONTEXT_PARAM = "@rovy/networking/NetEventContext";
export const NET_RUNTIME_PARAM = "@rovy/networking/NetRuntime";
export const NET_FUNCTION_RESPONDER_PARAM = "@rovy/networking/NetFunctionResponder";
export const NET_FUNCTION_READER_PARAM_PREFIX = "@rovy/networking/NetFunctionReader:";
export const NET_FUNCTION_PARAM_PREFIX = "@rovy/networking/NetFunc:";

export interface NetEventOptions {
	direction: NetEventDirection;
	channel?: NetEventChannel;
	receive?: NetEventReceiveMode;
}

export interface NetFunctionOptions<Result extends object = object> {
	direction: "clientToServer";
	result: Ctor<Result>;
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

export interface NetFunctionReg {
	readonly ctor: Ctor;
	readonly id: string;
	readonly name: string;
	readonly direction: "clientToServer";
	readonly fields: ReadonlyArray<string>;
	readonly result: Ctor;
	readonly resultName: string;
	readonly resultFields: ReadonlyArray<string>;
	readonly requestName: string;
	readonly resultWireName: string;
	readonly requestBlink?: string;
	readonly resultBlink?: string;
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

export interface NetCallHandle<F extends object = object> {
	readonly functionId: string;
	readonly callSiteId: string;
	readonly sequence: number;
	readonly request?: F;
}

export interface NetFunctionRequestOutboxItem {
	readonly request: object;
	readonly meta: NetFunctionReg;
	readonly handle: NetCallHandle;
	readonly target: { readonly kind: "server" };
}

export interface NetFunctionCall<F extends object = object> {
	readonly request: F;
	readonly meta: NetFunctionReg;
	readonly handle: NetCallHandle<F>;
	readonly sender?: Player;
}

export type NetFunctionResult<R extends object = object> =
	| { readonly ok: true; readonly value: R }
	| { readonly ok: false; readonly error: string };
export type NetFunctionRejected = { readonly ok: false; readonly error: string };
export type NetFunctionCallResult<R extends object = object> = R | NetFunctionRejected | undefined;

export interface NetFunctionResultOutboxItem {
	readonly call: NetFunctionCall;
	readonly result: NetFunctionResult;
	readonly target: { readonly kind: "player"; readonly player: Player };
}

export interface NetFunctionRequestEnvelope {
	readonly callSiteId: string;
	readonly sequence: number;
	readonly payload: Record<string, unknown>;
}

export interface NetFunctionResultEnvelope {
	readonly callSiteId: string;
	readonly sequence: number;
	readonly ok: boolean;
	readonly payload?: Record<string, unknown>;
	readonly error?: string;
}

/** Decoded inbound message handed back by a transport's poll(). */
export interface NetInboundItem {
	readonly meta: NetEventReg;
	readonly event: object;
	/** Roblox player for client→server messages; undefined on the client. */
	readonly sender?: Player;
}

export function netFunctionReaderParam(functionId: string): string {
	return `${NET_FUNCTION_READER_PARAM_PREFIX}${functionId}`;
}

export function netFunctionParam(functionId: string): string {
	return `${NET_FUNCTION_PARAM_PREFIX}${functionId}`;
}
