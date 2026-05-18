# Milestone 5 — Prefabs (Planned)

## ⬜ Phase 19 — Docs and regression coverage

- [ ] Update docs:
  - [ ] `docs/04-commands.md`
  - [ ] `docs/12-api-reference.md`
  - [ ] `docs/17-systems-and-injection.md`
  - [ ] `docs/19-compiled-output.md`
  - [ ] `docs/20-runtime-lifecycle.md`
  - [ ] `docs/21-packages.md`
  - [ ] `docs/README.md`
- [ ] Document prefab semantics clearly:
  - [ ] prefab is singleton and static in v1
  - [ ] prefab is build-time sugar for entity construction/filling
  - [ ] prefab `build(...)` receives injected runtime values
  - [ ] prefab authors should use the prefab base helper to access the current target entity
  - [ ] `commands` path reserves ids up front
- [ ] Add or update compile-only type fixture coverage in `packages/core/src/__typecheck.ts`
- [ ] Add regression coverage that normal component/tag bundle handling still works after prefab detection lands
- [ ] **Exit:** docs match runtime reality and prefab additions do not regress collectors/resources/system injection or normal bundle behavior

