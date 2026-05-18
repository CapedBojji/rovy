# Milestone 5 — Prefabs (Planned)

## ⬜ Phase 20 — Plugin API surface + docs + example

- [x] Add `Plugin` interface to `packages/core/src/runtime/plugin.ts`
- [x] Update `app.ts` to use `Plugin` type (replace anonymous duck-type)
- [x] Export `Plugin` from `packages/core/src/index.ts`
- [x] Write `docs/25-plugins.md`
- [x] Add `examples/plugin-example/` (`@rovy/example-gameclock` roblox-ts package)
- [x] Update `examples/roblox-ts-game` to consume plugin via `app.addPlugin`
- [ ] Verify both examples build clean with `rbxtsc`
- [ ] **Exit:** `Plugin` exported from `@rovy/core`; plugin-example package builds; roblox-ts-game shows explicit `addPlugin` usage; docs cover full authoring model


