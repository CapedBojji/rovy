# Milestone 3 — External Signal Bridge (Phases 13–15)

## ✅ Phase 13 — Collector contract + decorator + transformer lowering

- [x] Added `@collect` no-op decorator to `packages/core/src/decorators.ts` and exported it from `packages/core/src/index.ts`
- [x] Extended frozen contract with `CollectReg`, `CollectParam`, `registry.collectors`, and bumped `CONTRACT_VERSION` to `2`
- [x] Added `rovy.__collect(ctor, id)` registry entry point and reset coverage
- [x] Transformer now recognizes `@collect`, injects `rovy.__collect(...)`, and lowers collector class params to `{ kind = "collect", ctor = ... }`
- [x] Transformer preserves observer first-param event precedence over collector matching
- [x] `packages/core/src/__typecheck.ts` now exercises collector params in system / observer / monitor authoring positions
- [x] **Exit:** transformer fixture coverage proves `__collect` injection and collect-param lowering in system / observer / monitor contexts

