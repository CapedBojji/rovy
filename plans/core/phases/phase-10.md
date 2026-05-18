# Milestone 2 — Full Surface (Phases 7–12)

## ✅ Phase 10 — Relationships

- [x] `registerRelation` → jecs relation id; native `Exclusive` + `pair(OnDelete/OnDeleteTarget, Delete/Remove)` for policies; `world.relate/unrelate/hasRelation/getRelation/relationTarget`; `commands.relate/unrelate` deferred hooks wired
- [x] `RelationQueryHandle` (QueryLike): candidates via `jecs.each(pair(Rel,Wildcard))`; `Pair<R>` binds `{target,data}`; `HasPair<R>` filter; `withTarget(e)` clones pinned to target; relationship monitors via reconcile/members
- [x] App routes pair/hasPair descriptors → RelationQueryHandle (before trait/structural)
- [x] QueryHandle constructor now asserts component/Optional terms are registered (caught at start)
- [x] **Exit:** `test/specs/phase10.luau` 4/4 — tag+data round-trip (world+commands), exclusive drops prior, cascade despawns holder, Pair binds target / HasPair filters / withTarget narrows; phase5 canary repurposed to unregistered-component invariant
- Files: `src/runtime/relations.ts`, `src/runtime/world.ts`, `src/runtime/app.ts`, `src/runtime/query.ts`

