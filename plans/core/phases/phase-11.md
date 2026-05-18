# Milestone 2 — Full Surface (Phases 7–12)

## ✅ Phase 11 — Plugins + loadPaths hardening + dev errors

- [x] `@plugin` decorator (no-op marker) + `app.addPlugin({build})`; `plugin.build(app)` runs first in `start()` → `configureSets`/`insertResource` before finalize
- [x] Dev validation pass: systems/observers/monitors with `res`/`resMut`/`eventReader`/`eventWriter` for unregistered deps throw a **named** error (`'sys/Id' needs unregistered @resource: X`); `optRes` tolerant
- [x] `loadPaths` default provider requires Instance-tree ModuleScripts (Roblox `require` caches → side effects once); injected provider for Lune tests; registries additive + single `start()` guard cover idempotency/cycles
- [~] `Object.freeze` on `Res` — **deferred** (locked decision: `ResMut` advisory-only v1; no runtime freeze)
- [~] Real Instance-tree TestEZ/run-in-roblox suite — **deferred** (no Studio in CI; injected-provider path fully covered under Lune; real walk is thin glue, low risk — tracked for when a Roblox CI exists)
- [x] **Exit:** `test/specs/phase11.luau` 5/5 — plugin configures sets + inserts resource pre-finalize; unregistered @resource/@event throw named; OptRes tolerant; loadPaths delegates
- Files: `src/runtime/app.ts` (validation + plugin order), `src/runtime/events.ts` (`hasEvent`), `src/decorators.ts` (`plugin`)

