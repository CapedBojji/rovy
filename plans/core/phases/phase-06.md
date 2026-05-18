# Milestone 1 — Usable Core (Phases 0–6)

## ✅ Phase 6 — Events + observers

- [x] `@event` finalize → capacity-ring `EventBuffer`; `EventReaderHandle`/`EventWriterHandle`; `commands.send`/`EventWriter.send`
- [x] `commands.trigger` deferred (via `CommandsImpl.deferredTrigger`) + `world.trigger` immediate (`triggerImpl`)
- [x] Observer dispatch table per event, priority sort at finalize (stable, higher-first); `dispatch` runs through resolved params (`event/commands/world/query/res`)
- [x] Observer-produced triggers re-enter flush to convergence (existing flush loop)
- [x] Event buffers drained at schedule-run boundary (depth-0, with changeTick bump)
- [x] Empty-registry assert broadened (observer-only apps valid)
- [x] **Exit:** `test/specs/phase6.luau` 5/5 — send→reader drains+clears, priority order, param injection, deferred trigger chain converges, capacity drops oldest
- Files: `src/runtime/events.ts`, `src/runtime/app.ts`, `src/runtime/schedule.ts`, `src/runtime/world.ts`, `src/runtime/resolve-param.ts`

> **✅ Milestone 1 COMPLETE (Phases 0–6).** Usable core: spawn/query/scheduled-systems/events/observers green under Lune. 33/33 specs. Commits `3bbe6e3`→`b83e79c`.

> **✅ Milestone 1 complete when Phases 0–6 done:** spawn, query, scheduled systems, events/observers working under Lune.

---


