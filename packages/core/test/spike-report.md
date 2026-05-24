# jecs API Spike Report

**Package:** `@rovy/jecs@0.11.0` (installed). Source: `node_modules/@rovy/jecs/src/jecs.{luau,d.ts}` (4094-line luau, 385-line d.ts).
**Date:** 2026-05-15. **Gates:** Phases 7–9.

Legend: ✅ public-typed · 🟦 public-untyped (runtime-present, not in `.d.ts` → vendored augmentation) · 🟥 internal-only (unexported local) · ❌ missing

## Core entity/component/query

| Symbol | Status | Notes |
|--------|--------|-------|
| `world()` / `World` | ✅ | `jecs.world(DEBUG?)`. No `World.new`. |
| `world.entity()` / `entity(id)` | ✅ | Tag entity. No `world.spawn`. |
| `world.component<T>()` | ✅ | Static component id (first 256). |
| `world.add(e, c)` | ✅ | Tag add. |
| `world.set(e, c, v)` | ✅ | Data set. Also overloaded as hook installer `set(comp, OnAdd, cb)`. |
| `world.get(e, ...≤4)` | ✅ | Tuple, each nullable. |
| `world.has(e, ...)` / `contains` / `exists` | ✅ | |
| `world.remove(e, c)` / `delete(e)` / `clear(e)` | ✅ | |
| `world.each(id)` / `children(p)` / `target` / `parent` | ✅ | iterators + relationship traversal |
| `world.query(...).with().without()` | ✅ | Returns `Query`. Iterable: `for e, a, b in q`. |
| `query.iter()` / `query.archetypes()` | ✅ | `archetypes()` → `Archetype[]` with `id, entities, columns, columns_map, types`. |
| **`query.cached()` → `CachedQuery`** | ✅ | **Key.** `CachedQuery` has `archetypes()`, **`has(entity): boolean`**, `fini()`, iterable. jecs keeps the cached archetype list live internally via `observable`. |
| `record(world, e)` | ✅ | Exported. `{ archetype, row, dense }`. `record(world,e).archetype` works. |
| `pair(p,o)` / `IS_PAIR` / `pair_first/second` / `ECS_PAIR_FIRST/SECOND` | ✅ | Relationships. |
| `Wildcard` / `ChildOf` / `Name` / `Component` | ✅ | Built-ins. |
| `OnAdd` / `OnChange` / `OnRemove` | ✅ | Hook components (set via `world.set(comp, OnAdd, cb)`). |
| `OnDelete` / `OnDeleteTarget` / `Delete` / `Remove` / `Exclusive` | ✅ | Native cleanup-policy + exclusive primitives → Phase 10 maps `@relation` options directly onto these. |
| `bulk_insert` / `bulk_remove` / `component_record` / `meta` / `is_tag` | ✅ | Useful for spawn-bundle + introspection. |

## Lifecycle hooks (Phases 7–9 critical)

| Symbol | Status | Notes |
|--------|--------|-------|
| `world.added(comp, fn)` | 🟦 | **Runtime fn arity = `(e, id, value, oldarchetype)` (4 args).** `.d.ts` only types 3 (`e,id,value`). luau `Listener<T>` (jecs.luau:3107-3119) forwards `oldarchetype`. **Docs 16/18/20's assumed 4th `srcArchetype` is REAL** — just untyped. → vendor augmentation. Returns disconnect fn. Fires AFTER archetype move. |
| `world.changed(comp, fn)` | 🟦 | Same 4-arg runtime shape (`oldarchetype`), typed 3. Fires on `set` of existing. |
| `world.removed(comp, fn)` | ✅ | Runtime `(e, id, deleted?: boolean)` — **3 args, no archetype** (matches `.d.ts`). Fires BEFORE archetype move (record still = source). |
| `world.observable` | 🟦 | `Map<event, Map<comp,{Observer}>>` field, runtime-present (jecs.luau:2756). Keyed internally by `EcsOnArchetypeCreate/Delete`. **Not needed directly** — `cached()` already consumes it. |
| `world.ROOT_ARCHETYPE` | 🟦 | Runtime field (jecs.luau:2761). Untyped. Likely **not needed** (see monitor redesign). |
| `world.archetype_edges` | 🟦 | Runtime field. Untyped. Only needed if reimplementing traversal (avoided). |
| `archetype_traverse_remove(world,id,from)` | 🟥 | **Unexported local** (jecs.luau:1118). NOT callable externally. Docs 18/20 assumed `jecs.archetype_traverse_remove` — **unavailable**. → monitor exit redesigned to not need it. |
| `EcsOnArchetypeCreate/Delete` | 🟥 | Internal locals (`HI_COMPONENT_ID + 12/13`). Not exported. Not needed (cached query wraps them). |
| `jecs.Or` | ❌ | No query OR. `HasTrait<T>` = union of N per-implementer sub-queries (not a single Or-query). |

## Decisions / mitigations

1. **Monitor design change (supersedes docs 18/20 internal mechanism; observable behavior unchanged).**
   `archetype_traverse_remove`/`EcsOnArchetypeCreate`/manual `observable` are NOT externally usable. Replace with the **public `CachedQuery`**:
   - Build match query → `:cached()` → `cq` (jecs keeps its archetype set live).
   - Maintain a per-monitor `wasMember: Set<Entity>`.
   - **Enter**: in `world.added(term, e ...)` (fires post-move) → `cq:has(e)` accurate. `if cq:has(e) and not wasMember[e]` → `onEnter`, mark.
   - **Exit on lost required term**: in `world.removed(term, e ...)` (pre-move) → losing any required term always breaks a conjunctive match. `if wasMember[e]` → `onExit`, unmark. No dst archetype needed.
   - **Exit on gained excluded (`Without`) term**: in `world.added(withoutTerm, e ...)` (post-move) → `if wasMember[e] and not cq:has(e)` → `onExit`, unmark.
   - **Enter on lost excluded term**: `world.removed(withoutTerm, e ...)` is pre-move so `cq:has(e)` is stale. **Phase 8 open item** — options: (a) per-schedule-run reconcile pass diffing `cq.archetypes()` membership vs `wasMember`; (b) defer the check to next `cq` touch. Recommend (a): cheap, deterministic, also self-heals despawn/edge cases.
   - **Change**: `world.changed(term, e ...)` → `if cq:has(e)` → `onChange`.
   - **Despawn**: `world.removed` fires per component with `deleted=true`; the lost-required-term rule already emits one `onExit`; guard with `wasMember` to fire once.
   This uses only ✅/🟦 APIs. `archetype_traverse_remove`/`ROOT_ARCHETYPE` no longer required.

2. **Vendored `src/types/jecs-internal.d.ts`** (minimal, high-value only): augment `World.added`/`changed` listener with 4th `oldarchetype: Archetype` param. Defer `observable`/`ROOT_ARCHETYPE`/`archetype_edges` augmentation unless Phase 8 reconcile (option a) is dropped for traversal.

3. **Change detection (Phase 7)**: `world.added/changed/removed` + disconnect fns are sufficient. `added`+`changed`→ tick stores; `removed`→ removed buffer. No internals needed. ✅

4. **Traits (Phase 9)**: no `Or` → `Trait<T>`/`HasTrait<T>` = N sub-queries unioned in a `TraitQueryHandle` (already the doc-09 design). ✅

5. **Relationships (Phase 10)**: native `OnDelete`/`OnDeleteTarget` + `Delete`/`Remove` + `Exclusive` map 1:1 to `@relation` `onDelete`/`onTargetDelete`/`exclusive`. No custom cleanup engine needed. ✅

6. **Spawn bundle**: no `world.spawn`. `Commands.spawn` = `world.entity()` then per-arg `world.add` (tag) / `world.set` (instance). `bulk_insert` optional optimization.

## Net

No ❌ blockers for Milestone 1. Monitors (Phase 8) viable on **public** API via `cached()` — strictly better than the internal-traversal design in docs 18/20; docs to be updated when Phase 8 lands. One Phase-8 open item (lost-excluded-term enter) with a chosen mitigation (per-run reconcile). Vendored d.ts scope reduced to just the `added/changed` 4th-arg typing.
