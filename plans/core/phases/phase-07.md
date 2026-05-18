# Milestone 2 — Full Surface (Phases 7–12)

## ✅ Phase 7 — Change detection (`Changed`/`Added`/`Removed`)

- [x] `RovyWorld.registerChangeDetection(id)` at finalize: changeStore/addedStore/removedBuf on jecs `added`(+addedStore)/`changed`/`removed`
- [x] `FilteredQueryHandle` per-resolve view, tick check vs `ctx.lastRunTick`; `Changed/Added` imply structural `With<C>` (entity-only queries constrained correctly; empty-args promotes a With id)
- [x] `Removed<C>` drains `removedSince(id,lastRunTick)`, Entity-only bind; `world.clearRemoved()` at schedule-run boundary (with events.clearAll + changeTick bump)
- [x] First-run `lastRunTick=-1` → all (Bevy parity); deferred writes visible cross-set same run via set-boundary flush
- [x] **Exit:** `test/specs/phase7.luau` 3/3 — Changed first-all/quiet-none/set-again, Added≠Changed, Removed once; fixed stale phase5 assertion (Changed now valid → HasTrait used)
- Files: `src/runtime/world.ts`, `src/runtime/query.ts`, `src/runtime/resolve-param.ts`, `src/runtime/schedule.ts`, `src/runtime/app.ts`

