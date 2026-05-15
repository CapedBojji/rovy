// @rovy/core — public surface.

export const VERSION = "0.0.0";

// Authoring types (erased at runtime by the transformer).
export * from "./types";

// Decorators (no-op markers; transformer injects rovy.__*).
export {
	component,
	resource,
	plugin,
	event,
	system,
	observer,
	monitor,
	relation,
	schedule,
	set,
} from "./decorators";
export type {
	EventOptions,
	SystemOptions,
	ObserverOptions,
	MonitorOptions,
	RelationOptions,
	ScheduleOptions,
	SetOptions,
} from "./decorators";

// Compile-time macros (transformer rewrites; throw if reached untransformed).
export { trait, query } from "./macros";

// Runtime registry (public for the transformer + tests).
export { rovy } from "./rovy";
export type { TraitToken, ModuleProvider } from "./rovy";

// Runtime (Phase 2+).
export { App } from "./runtime/app";
export { RovyWorld } from "./runtime/world";
export { CommandsImpl } from "./runtime/commands";

// Frozen transformer↔runtime contract.
export * from "./contract";
