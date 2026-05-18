# Milestone 5 — Prefabs (Planned)

## ⬜ Phase 17 — `@prefab` contract, runtime shape, transformer lowering

- [ ] Add `@prefab` no-op decorator to `@rovy/core` public surface
- [ ] Extend the frozen contract with:
  - [ ] `PrefabReg`
  - [ ] `registry.prefabs`
  - [ ] `rovy.__prefab(ctor, meta)`
  - [ ] prefab `build(...)` param descriptors
- [ ] Add a runtime authoring base like `Prefab<T extends Entity = Entity>` to `packages/core/src/types/index.ts`
- [ ] Prefab base must expose the runtime-selected target entity to authored `build(...)`
  - [ ] preferred shape: `this.entity()`
  - [ ] this is required so the same prefab can support both `world.spawn(PrefabClass)` and `world.insert(entity, PrefabClass)`
- [ ] Lock v1 prefab semantics:
  - [ ] app-owned singleton prefab instances, like collectors
  - [ ] zero-arg/default-constructible only
  - [ ] static only: no per-spawn payload, no constructor state
  - [ ] `build(...)` must return the target entity the runtime selected
- [ ] Transformer support:
  - [ ] scan `@prefab`
  - [ ] require `build(...)`
  - [ ] lower `build(...)` params through the same descriptor pipeline used by systems/observers/monitors
  - [ ] reject non-defaulted constructor params
  - [ ] reject unsupported prefab param kinds
- [ ] Supported prefab `build(...)` params in v1:
  - [ ] `Commands`
  - [ ] `World`
  - [ ] `Res<T>`, `ResMut<T>`, `OptRes<T>`
  - [ ] `@collect` classes
  - [ ] external package params
  - [ ] `EventWriter<E>`
- [ ] Explicitly unsupported in v1 prefab `build(...)`:
  - [ ] `Query<...>`
  - [ ] `EventReader<E>`
  - [ ] observer-only `event`
  - [ ] monitor-only `entity` / `term`
  - [ ] `Local<T>` for now
- [ ] **Exit:** transformer fixture coverage proves `__prefab` injection, valid prefab param lowering, invalid param rejection, and zero-arg constructor validation

