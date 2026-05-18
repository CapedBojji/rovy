# Milestone 1 — Usable Core (Phases 0–6)

## ✅ Phase 3 — Commands buffer + flush

- [x] `CommandsImpl`: `spawn/despawn/insert/set/remove` real; `send/trigger/relate/unrelate/runSchedule` queue via swappable `deferred*` hooks (wired in phases 4/6/10)
- [x] Spawn bundle instance-vs-tag detection reuses `RovyWorld.applyBundle` (doc 20)
- [x] `flush()` FIFO drain + convergence loop w/ cycle cap; `App.flush()` wired
- [x] **Exit:** `test/specs/phase3.luau` 6/6 green — deferred set/spawn/despawn invisible until flush then materialized; FIFO order; queued send/trigger/relate harmless pre-phase; converges
- Files: `src/runtime/commands.ts`, `src/runtime/flush.ts`, `src/runtime/app.ts`

