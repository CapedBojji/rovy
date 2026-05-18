# Milestone 5 — Prefabs (Planned)

## ⬜ Phase 18 — Runtime prefab invocation through `world` and `commands`

- [ ] `App` owns singleton prefab instances keyed by ctor, similar to collectors
- [ ] `app.start()` must:
  - [ ] instantiate each prefab once
  - [ ] validate callable `build(...)`
  - [ ] validate prefab dependency params with named errors, same style as systems/observers/monitors
- [ ] Add prefab invocation plumbing to runtime:
  - [ ] detect prefab bundle items before normal component/tag classification
  - [ ] invoke prefab build against a known target entity
  - [ ] restore prefab instance target context safely after nested prefab calls
- [ ] `world.spawn(...bundle)`:
  - [ ] create target entity first
  - [ ] apply bundle items into that entity
  - [ ] when a prefab item appears, call its `build(...)` against that same entity
- [ ] `world.insert(entity, item)`:
  - [ ] if `item` is a prefab, build into the provided entity immediately
- [ ] `commands.spawn(...bundle)`:
  - [ ] reserve/create the entity id immediately
  - [ ] queue spawn work against that reserved id
  - [ ] flush must build prefabs onto that exact reserved entity
- [ ] `commands.insert(entity, item)`:
  - [ ] if `item` is a prefab, defer build until flush but target the provided entity
- [ ] Keep non-prefab bundle behavior unchanged
- [ ] `commands.spawn(...)` likely needs to return the reserved entity id once prefab support lands
- [ ] Build-return invariant:
  - [ ] runtime should fail loudly if prefab `build(...)` returns a different entity than the target entity
- [ ] **Exit:** core runtime specs prove prefab singletons, world spawn/insert behavior, command reserved-id behavior, dependency injection, and named failures

