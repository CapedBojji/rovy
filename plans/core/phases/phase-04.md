# Milestone 1 — Usable Core (Phases 0–6)

## ✅ Phase 4 — Schedules + sets + scheduler + param resolver (the spine)

- [x] `@schedule` finalize → `Scheduler.build`; `SystemSet` (types); `app.configureSets`
- [x] `Scheduler.run`: configured-set order + implicit ungrouped bucket; intra-set after/before Kahn topo sort (stable by reg index); flush at set boundaries; `world.changeTick += 1` per outer run
- [x] `resolveParam` for `commands/world/res/resMut/optRes/local/entity/term/event`; query/event-channel throw "not until phase N"
- [x] `runOnStart` fires in `start()` after scheduler.build
- [x] `commands.runSchedule` + `world.runSchedule` wired; re-entrancy via depth (tick bump only at depth 0)
- [x] **Calling note:** scheduler invokes `instance.run(instance, ...args)` (explicit self) — roblox-ts compiles `{run}` plain-type call as dot (no self injection)
- [x] **Exit:** `test/specs/phase4.luau` 6/6 green — resolved Commands+Res, after/before order A,B,C, Local persists across 3 runs, runOnStart once, changeTick/run, re-entrancy
- Files: `src/runtime/schedule.ts`, `src/runtime/resolve-param.ts`, `src/runtime/app.ts`, `src/runtime/world.ts` (SystemSet base in `src/types`)

