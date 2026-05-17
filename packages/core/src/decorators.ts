/**
 * Decorators are **no-op markers**. They intentionally do nothing at runtime:
 * the `rovy-transformer` injects the real `rovy.__*` registration call after
 * the decorated class (see docs/19, docs/21). Keeping them inert means
 * hand-written tests (and any un-transformed usage) don't double-register or
 * crash — the transformer is the single source of registration.
 *
 * Option-taking decorators (`@event(opts)`, `@system(opts)`, …) are factories
 * returning the inert class decorator. The options object is consumed by the
 * transformer at build time, not here.
 */

import type { Ctor } from "./contract";
import type { CleanupPolicy } from "./contract";

/** Constructor accepted as a `set:` value — abstract (SystemSet subclasses are abstract-compatible). */
export type AbstractCtor<T extends object = object> = abstract new (...args: never[]) => T;

const noop = (_ctor: Ctor): void => {
	// transformer injects rovy.__* — nothing to do at runtime
};

// ─── Bare marker decorators ─────────────────────────────────────────────────

export function component(_ctor: Ctor): void {}
export function collect(_ctor: Ctor): void {}
export function resource(_ctor: Ctor): void {}
export function plugin(_ctor: Ctor): void {}

// ─── Option-taking decorator factories ──────────────────────────────────────

export interface EventOptions {
	capacity?: number;
	label?: string;
}
export function event(_options?: EventOptions): (ctor: Ctor) => void {
	return noop;
}

export interface SystemOptions {
	schedule: Ctor;
	set?: AbstractCtor;
	after?: ReadonlyArray<Ctor>;
	before?: ReadonlyArray<Ctor>;
	runIf?: () => boolean;
}
export function system(_options: SystemOptions): (ctor: Ctor) => void {
	return noop;
}

export interface ObserverOptions {
	event: Ctor;
	priority?: number;
}
export function observer(_options: ObserverOptions): (ctor: Ctor) => void {
	return noop;
}

export interface MonitorOptions {
	/** Result of the `query<...>()` macro (rewritten by the transformer). */
	match: unknown;
}
export function monitor(_options: MonitorOptions): (ctor: Ctor) => void {
	return noop;
}

export interface RelationOptions {
	exclusive?: boolean;
	onTargetDelete?: CleanupPolicy;
	onDelete?: CleanupPolicy;
}
/** Dual: `@relation class C {}` or `@relation({ exclusive: true }) class C {}`. */
export function relation(ctor: Ctor): void;
export function relation(options?: RelationOptions): (ctor: Ctor) => void;
export function relation(arg?: Ctor | RelationOptions): ((ctor: Ctor) => void) | void {
	if (typeIs(arg, "function")) return;
	return noop;
}

export interface ScheduleOptions {
	runOnStart?: boolean;
}
/** Dual: `@schedule class S {}` or `@schedule({ runOnStart: true }) class S {}`. */
export function schedule(ctor: Ctor): void;
export function schedule(options?: ScheduleOptions): (ctor: Ctor) => void;
export function schedule(arg?: Ctor | ScheduleOptions): ((ctor: Ctor) => void) | void {
	if (typeIs(arg, "function")) return;
	return noop;
}

export interface SetOptions {
	label?: string;
}
export function set(_options?: SetOptions): (ctor: Ctor) => void {
	return noop;
}
