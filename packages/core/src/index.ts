// @rovy/core — public surface.

export const VERSION = "0.0.0";

// Authoring types (erased at runtime by the transformer).
export * from "./types";

// Decorators (no-op markers; transformer injects rovy.__*).
export {
	component,
	collect,
	resource,
	prefab,
	plugin,
	event,
	system,
	observer,
	monitor,
	relation,
	schedule,
	set,
	inspect,
} from "./decorators";
export type {
	EventOptions,
	SystemOptions,
	ObserverOptions,
	MonitorOptions,
	RelationOptions,
	ScheduleOptions,
	SetOptions,
	InspectOptions,
} from "./decorators";

// Compile-time macros (transformer rewrites; throw if reached untransformed).
export { trait, query, $collectRef } from "./macros";

// Runtime registry (public for the transformer + tests).
export { rovy } from "./rovy";
export type { TraitToken, ModuleProvider } from "./rovy";

// Runtime (Phase 2+).
export { App } from "./runtime/app";
export { RovyWorld } from "./runtime/world";
export { CommandsImpl } from "./runtime/commands";
export { Scheduler } from "./runtime/schedule";
export { ScheduleContext } from "./runtime/schedule-context";
export { QueryHandle, FilteredQueryHandle } from "./runtime/query";
export { EventRegistry, EventReaderHandle, EventWriterHandle } from "./runtime/events";
export { MonitorRegistry } from "./runtime/monitors";
export { TraitQueryHandle } from "./runtime/traits";
export { RelationQueryHandle } from "./runtime/relations";
export { EntityRefStore } from "./runtime/ref";
export { resolveParams } from "./runtime/resolve-param";
export type { ResolveCtx, LocalStore } from "./runtime/resolve-param";
export { registerAppExtension, runAppExtensions, resetAppExtensions } from "./runtime/extensions";
export type { Plugin } from "./runtime/plugin";

// Frozen transformer↔runtime contract.
export * from "./contract";
