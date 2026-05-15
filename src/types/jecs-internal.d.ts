/**
 * Vendored typing augmentation for `@rbxts/jecs@0.11.0`.
 *
 * The published `.d.ts` under-types two runtime realities the rovy runtime
 * depends on (see `test/spike-report.md`). roblox-ts cannot merge new
 * overloads into the exported `World` *class* across a module boundary, so
 * instead of module augmentation we export helper types + an `InternalWorld`
 * view. Call sites cast through these — that cast is the single, audited
 * place where we rely on jecs internals.
 *
 * Scope is deliberately minimal: only what the spike proved real and needed.
 * Re-audit on every `@rbxts/jecs` bump.
 */

import type { Archetype, Entity, Id, World } from "@rbxts/jecs";

/**
 * Runtime arity of `world.added` / `world.changed` listeners.
 *
 * Published `.d.ts`: `(e, id, value)` (3 args).
 * Actual runtime (jecs.luau:3107-3164): `(e, id, value, oldarchetype)` —
 * jecs forwards the source archetype as a 4th arg. Required by monitors
 * (docs 18/20) to detect archetype transitions.
 */
export type AddedListener<T> = (
	e: Entity,
	id: Id<T>,
	value: T,
	oldarchetype: Archetype<Id[]>,
) => void;

/**
 * `world.removed` is correctly typed by jecs as `(e, id, deleted?)` — no
 * archetype arg (hook fires before the archetype move). Re-exported only for
 * symmetry / call-site clarity.
 */
export type RemovedListener = (e: Entity, id: Id, deleted?: boolean) => void;

/**
 * Internal `World` fields that exist at runtime but are absent from the
 * published typings. Present here for completeness; the Phase 8 monitor
 * design (per-run reconcile over `CachedQuery`) intentionally avoids needing
 * these — keep unused unless that design changes.
 *
 * - `observable`  — jecs.luau:2756, archetype-event registry (consumed by `cached()`).
 * - `ROOT_ARCHETYPE` — jecs.luau:2761, the empty archetype.
 * - `archetype_edges` — adjacency used by internal traversal.
 */
export interface InternalWorld extends World {
	readonly observable: ReadonlyMap<unknown, ReadonlyMap<unknown, ReadonlyArray<unknown>>>;
	readonly ROOT_ARCHETYPE: Archetype<Id[]>;
	readonly archetype_edges: ReadonlyMap<number, ReadonlyMap<number, Archetype<Id[]>>>;
}

/** Audited cast to reach the runtime-real 4th `oldarchetype` arg. */
export type AddedHook = <T>(
	world: World,
	component: Entity<T>,
	listener: AddedListener<T>,
) => () => void;
