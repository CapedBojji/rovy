# Milestone 2 — Full Surface (Phases 7–12)

## ✅ Phase 9 — Traits runtime

- [x] `ResolvedTraits` (stable id → impl ctor+jecsId) built at finalize from `rovy.registry.traits` + componentMap
- [x] `TraitQueryHandle` (implements `QueryLike`): candidates = union of impl-bearing entities ∩ structural (no `jecs.Or`); `Trait<T>` → one row per present impl; `AllTraits<T>` → one row/entity + array; `HasTrait<T>` filter
- [x] `QueryLike` interface unifies QueryHandle/Filtered/Trait; App routes trait-using descriptors via `descriptorUsesTraits`; tick+trait combo asserts unsupported
- [x] Trait monitors work through reconcile over `TraitQueryHandle.members()` (per-entity; public-API design, not per-impl wiring)
- [x] `traitToken` already in `rovy` (Phase 1)
- [x] **Exit:** `test/specs/phase9.luau` 4/4 — Stunned+Rooted→2 `Trait` rows, AllTraits 1 row/entity+array, HasTrait filter, trait monitor enter/exit; fixed stale phase5 (→ HasPair)
- Files: `src/runtime/traits.ts`, `src/runtime/query.ts` (`QueryLike`), `src/runtime/app.ts`, resolve-param/scheduler/monitors typing

