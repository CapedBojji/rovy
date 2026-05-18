# Milestone 2 — Full Surface (Phases 7–12)

## ✅ Phase 8 — Monitors (lifecycle via public cached-query reconcile)

- [x] **Spike redesign used:** per-monitor `was: Set<Entity>` reconciled vs `QueryHandle.members()`/`has()` at flush + every set-boundary + start (NOT internal `archetype_traverse_remove`/`observable`). Covers enter/exit incl gain-Without + despawn + lost-excluded-enter the hook path can't see pre-move.
- [x] `onChange` immediate via jecs `changed` hook per term component, gated on `was.has(e) && base.has(e)`
- [x] Param resolution `entity`/`term[index]` (1-based Lua-table to survive Optional holes); `commands`/`res`/etc via shared baseCtx
- [x] `scheduler.onFlush` + `App.flush`/`world.flush` + post-start drive `reconcileAll`
- [x] **Exit:** `test/specs/phase8.luau` 6/6 — enter-once+idempotent, exit on lost-required / gained-Without / despawn, onChange while matching not after exit, re-enter after exit
- [x] Entity deletion triggers `onExit`: despawn removes entity from `members()` → reconcile detects exit; verified by `test/specs/phase8.luau` "onExit on despawn" (line 87-95)
- Note: docs 18/20 internal-mechanism sections to be updated to the cached-query design (tracked, non-blocking)
- Files: `src/runtime/monitors.ts`, `src/runtime/query.ts` (`has`/`members`), `src/runtime/app.ts`, `src/runtime/schedule.ts`

