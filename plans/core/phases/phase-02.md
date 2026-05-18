# Milestone 1 — Usable Core (Phases 0–6)

## ✅ Phase 2 — World wrapper + component & resource registry + finalize skeleton

- [x] `RovyWorld` over jecs `world()`: `spawn/despawn/insert/set/remove/has/get`, `componentMap`/`resourceMap` (ctor→jecs id), instance-vs-tag bundle classify via `getmetatable`
- [x] `App.start()` finalize 1–2: components→ids; resources→ids + auto-instantiate default ctor on sentinel resource entity; `app.insertResource` override (pre- + post-start); `world.resource(C)`
- [x] Empty-registry assertion in `start()`; double-start guard; idOf errors on unregistered
- [x] **Exit:** `test/specs/phase2.luau` 6/6 green — spawn/get round-trip, tag add/remove, resource default, insertResource override before+after start, unregistered-component error
- Files: `src/runtime/world.ts`, `src/runtime/app.ts` (resources folded into world/app; no separate resources.ts)

