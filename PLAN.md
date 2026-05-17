# `@rovy/core` Implementation Plan & Progress Tracker

> Living tracker. Any AI/dev can resume from here.
> Update the status emoji + check boxes as work lands. Keep this in sync with reality.

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done · ⛔ blocked

---

## Context

`/Users/reikan404/Documents/rovy` is spec-only: 21 design docs in `docs/`, no code yet. Design is frozen (registration-injection model: transformer injects `rovy.__*` side-effect calls, `rovy.loadPaths` force-requires modules, `app.start()` finalizes). Build the **runtime package `@rovy/core` first**, before `rovy-transformer`.

Repo note: runtime now lives under `packages/core` in workspace layout, with transformer package at `packages/transformer`. Historical phase notes below still refer to old pre-workspace root paths.

Networking note: `@rovy/networking` is a distinct workspace package at `packages/networking`. Core stays ECS-focused; networking uses a net-neutral external param hook in core for injected package handles.

**Enabling insight:** core is fully buildable/testable WITHOUT the transformer — the `rovy.__*` API (docs 19/20) is a hand-writable contract; tests hand-write the calls the transformer would inject. That surface is the transformer↔runtime boundary, **frozen at Phase 1**.

Spec to keep open while implementing: `docs/19-compiled-output.md`, `docs/20-runtime-lifecycle.md`, `docs/16-change-detection.md`, `docs/18-monitors.md`, per-feature docs 02–11/17.

## Locked decisions

- **Test harness:** `@rbxts/jest` + `@rbxts/jest-globals` headless under **Lune**. `loadPaths` Instance-tree walk behind an injectable module-source provider so ~all specs stay Lune-pure.
- **StandardPlugin:** excluded from `@rovy/core` (separate optional package later). Core ships zero built-in schedules.
- **jecs internals:** vendor a `.d.ts` augmentation for internal jecs APIs (`world.observable[EcsOnArchetypeCreate/Delete]`, `jecs.archetype_traverse_remove`, `jecs.record`, `world.ROOT_ARCHETYPE`, 4-arg `world:added`). Phase 0 spike confirms upstream; augmentation makes them TS-callable.
- v1 open-question resolutions: forbid generics on `@system`/`@monitor`/`@observer`; `ResMut` advisory-only; `onChange` not deduped per step.

---

# Milestone 1 — Usable Core (Phases 0–6)

## ✅ Phase 0 — Scaffold + jecs spike + test harness

- [x] `package.json` (`name @rovy/core`, `main out/init.luau`, `types out/index.d.ts`, scripts `build/dev/test/spike`)
- [x] `tsconfig.json` (roblox-ts standard, `outDir out`, `rootDir src`, `plugins: []`)
- [x] `.gitignore` (`/node_modules /out /out-test /include *.tsbuildinfo`)
- [x] Rojo `default.project.json`; `mise.toml` pins lune 0.10.4 + rojo 7.6.1
- [x] Deps installed: `@rbxts/jecs@0.11.0`; dev: `roblox-ts@3.0.0`, `@rbxts/compiler-types@3.0.0-types.0`, `@rbxts/types`, `@rbxts/jest@3.16.0-ts.1`, `@rbxts/jest-globals`; lune via mise
- [x] **jecs API spike** → `test/spike-report.md` (full symbol table + mitigations)
- [x] Vendored `src/types/jecs-internal.d.ts` (minimal: `added/changed` 4th `oldarchetype` arg; `InternalWorld` view)
- [x] Substrate harness: `test/smoke.luau` green under Lune — jecs round-trip, with/without, **cached `has()`**, `record()`, **empirically confirms spike's 4-arg `added` claim**
- [x] **Exit:** build emits `out/init.luau`; smoke spec passes under Lune; spike report committed

**Spike outcome (gates 7–9):** no ❌ blockers. `archetype_traverse_remove`/`EcsOnArchetypeCreate` are unexported internals → **monitors redesigned around public `query:cached():has()` + per-run reconcile** (strictly better than docs 18/20 internal-traversal; docs to update when Phase 8 lands). `added/changed` 4th `oldarchetype` arg confirmed real (untyped → vendored). No `jecs.Or` → `HasTrait` = unioned sub-queries. Native `OnDelete/OnDeleteTarget/Delete/Remove/Exclusive` map 1:1 to `@relation` options.

**Scope note (carried to Phase 1):** full `@rbxts/jest`(jest-lua)-under-Lune adapter needs a roblox-ts RuntimeLib require shim — non-trivial, no real specs exist yet. Phase 0 proves the substrate (TS→Luau build + jecs headless under Lune). Wiring jest-lua + the roblox-ts-output require shim is the **first Phase 1 task** (fallback: `run-in-roblox`).

## ✅ Phase 1 — Type surface + decorator/macro stubs + `rovy` skeleton (CONTRACT FREEZE)

- [x] Type-only exports (`src/types/index.ts`): full list incl `Query`/`Res`/`Trait`/filters/`Entity`/`Commands`/`World`/`SystemSet`
- [x] Decorators = no-op markers (`src/decorators.ts`); `relation`/`schedule` dual via overloads; `set:` accepts `AbstractCtor`
- [x] `trait<T>()` / `query<...>()` = loud-throw stubs (doc 21 guard) (`src/macros.ts`)
- [x] `rovy` object (`src/rovy.ts`): registry tables + all `__*` push fns + `loadPaths` (provider-injectable via `setModuleProvider`) + `traitToken` + `__reset` — pure data push
- [x] **Frozen descriptor interfaces** (`src/contract.ts`, `CONTRACT_VERSION=1`); `param.kind` enum; `local`=`{kind,index,init?}`; query `handle`; all `*Reg`/`QueryDescriptor` shapes
- [x] **Calling convention recorded**: roblox-ts object methods take implicit `self` → transformer must emit `rovy:__x(...)` (colon). Noted in `contract.ts`.
- [x] Freeze: `@observer` stacking → one entry+instance per decorator; `runIf` zero-arg v1
- [x] Lune harness from Phase 0 reused (`test/harness/runtime.luau` RuntimeLib shim + `expect.luau`); jest-lua adapter still deferred
- [x] Evaluated `@rbxts/reflection@1.0.1` — defer, not a blocker (contract producer-agnostic)
- [x] **Exit:** `test/specs/phase1.luau` 7/7 green under Lune (`rovy:__*` populates registries, `loadPaths` delegates to injected provider, `traitToken` handle); `src/__typecheck.ts` mirrors doc-13 sigs, `rbxtsc` 0 errors
- Files: `src/index.ts`, `src/decorators.ts`, `src/macros.ts`, `src/types/index.ts`, `src/rovy.ts`, `src/contract.ts`, `src/__typecheck.ts`

## ✅ Phase 2 — World wrapper + component & resource registry + finalize skeleton

- [x] `RovyWorld` over jecs `world()`: `spawn/despawn/insert/set/remove/has/get`, `componentMap`/`resourceMap` (ctor→jecs id), instance-vs-tag bundle classify via `getmetatable`
- [x] `App.start()` finalize 1–2: components→ids; resources→ids + auto-instantiate default ctor on sentinel resource entity; `app.insertResource` override (pre- + post-start); `world.resource(C)`
- [x] Empty-registry assertion in `start()`; double-start guard; idOf errors on unregistered
- [x] **Exit:** `test/specs/phase2.luau` 6/6 green — spawn/get round-trip, tag add/remove, resource default, insertResource override before+after start, unregistered-component error
- Files: `src/runtime/world.ts`, `src/runtime/app.ts` (resources folded into world/app; no separate resources.ts)

## ✅ Phase 3 — Commands buffer + flush

- [x] `CommandsImpl`: `spawn/despawn/insert/set/remove` real; `send/trigger/relate/unrelate/runSchedule` queue via swappable `deferred*` hooks (wired in phases 4/6/10)
- [x] Spawn bundle instance-vs-tag detection reuses `RovyWorld.applyBundle` (doc 20)
- [x] `flush()` FIFO drain + convergence loop w/ cycle cap; `App.flush()` wired
- [x] **Exit:** `test/specs/phase3.luau` 6/6 green — deferred set/spawn/despawn invisible until flush then materialized; FIFO order; queued send/trigger/relate harmless pre-phase; converges
- Files: `src/runtime/commands.ts`, `src/runtime/flush.ts`, `src/runtime/app.ts`

## ✅ Phase 4 — Schedules + sets + scheduler + param resolver (the spine)

- [x] `@schedule` finalize → `Scheduler.build`; `SystemSet` (types); `app.configureSets`
- [x] `Scheduler.run`: configured-set order + implicit ungrouped bucket; intra-set after/before Kahn topo sort (stable by reg index); flush at set boundaries; `world.changeTick += 1` per outer run
- [x] `resolveParam` for `commands/world/res/resMut/optRes/local/entity/term/event`; query/event-channel throw "not until phase N"
- [x] `runOnStart` fires in `start()` after scheduler.build
- [x] `commands.runSchedule` + `world.runSchedule` wired; re-entrancy via depth (tick bump only at depth 0)
- [x] **Calling note:** scheduler invokes `instance.run(instance, ...args)` (explicit self) — roblox-ts compiles `{run}` plain-type call as dot (no self injection)
- [x] **Exit:** `test/specs/phase4.luau` 6/6 green — resolved Commands+Res, after/before order A,B,C, Local persists across 3 runs, runOnStart once, changeTick/run, re-entrancy
- Files: `src/runtime/schedule.ts`, `src/runtime/resolve-param.ts`, `src/runtime/app.ts`, `src/runtime/world.ts` (SystemSet base in `src/types`)

## ✅ Phase 5 — Query runtime: structural terms + filters

- [x] `QueryHandle`: cached jecs query (`:cached()`), iterate via `archetypes()` + column indexing (avoids roblox-ts iterator multi-return mangling), Entity/component/Optional binding in declared order, With/Without
- [x] `forEach/size/first/iter`; `first()` returns unpack directly (LuaTuple temp-var collapse pitfall documented)
- [x] `{kind:"query",handle}` resolves via `scheduler.queries`; multi-query independent; built at App.start step 3
- [x] tick (`Changed/Added/Removed`) + `HasTrait/HasPair` + trait/pair terms reject loudly (later phases)
- [x] **Exit:** `test/specs/phase5.luau` 4/4 green — Entity+Position+Optional with With/Without correct rows, size/first, multi-query independent, Changed rejected
- **roblox-ts gotchas captured:** (1) `table.pack(it())`→`table.pack({it()})` mangles multi-return → use archetypes; (2) loosely-typed jecs method call drops `self` → keep jecs types; (3) LuaTuple stored in a var collapses → return directly
- Files: `src/runtime/query.ts`, `src/runtime/resolve-param.ts`, `src/runtime/app.ts`, `src/runtime/schedule.ts`

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

# Milestone 2 — Full Surface (Phases 7–12)

## ✅ Phase 7 — Change detection (`Changed`/`Added`/`Removed`)

- [x] `RovyWorld.registerChangeDetection(id)` at finalize: changeStore/addedStore/removedBuf on jecs `added`(+addedStore)/`changed`/`removed`
- [x] `FilteredQueryHandle` per-resolve view, tick check vs `ctx.lastRunTick`; `Changed/Added` imply structural `With<C>` (entity-only queries constrained correctly; empty-args promotes a With id)
- [x] `Removed<C>` drains `removedSince(id,lastRunTick)`, Entity-only bind; `world.clearRemoved()` at schedule-run boundary (with events.clearAll + changeTick bump)
- [x] First-run `lastRunTick=-1` → all (Bevy parity); deferred writes visible cross-set same run via set-boundary flush
- [x] **Exit:** `test/specs/phase7.luau` 3/3 — Changed first-all/quiet-none/set-again, Added≠Changed, Removed once; fixed stale phase5 assertion (Changed now valid → HasTrait used)
- Files: `src/runtime/world.ts`, `src/runtime/query.ts`, `src/runtime/resolve-param.ts`, `src/runtime/schedule.ts`, `src/runtime/app.ts`

## ✅ Phase 8 — Monitors (lifecycle via public cached-query reconcile)

- [x] **Spike redesign used:** per-monitor `was: Set<Entity>` reconciled vs `QueryHandle.members()`/`has()` at flush + every set-boundary + start (NOT internal `archetype_traverse_remove`/`observable`). Covers enter/exit incl gain-Without + despawn + lost-excluded-enter the hook path can't see pre-move.
- [x] `onChange` immediate via jecs `changed` hook per term component, gated on `was.has(e) && base.has(e)`
- [x] Param resolution `entity`/`term[index]` (1-based Lua-table to survive Optional holes); `commands`/`res`/etc via shared baseCtx
- [x] `scheduler.onFlush` + `App.flush`/`world.flush` + post-start drive `reconcileAll`
- [x] **Exit:** `test/specs/phase8.luau` 6/6 — enter-once+idempotent, exit on lost-required / gained-Without / despawn, onChange while matching not after exit, re-enter after exit
- [x] Entity deletion triggers `onExit`: despawn removes entity from `members()` → reconcile detects exit; verified by `test/specs/phase8.luau` "onExit on despawn" (line 87-95)
- Note: docs 18/20 internal-mechanism sections to be updated to the cached-query design (tracked, non-blocking)
- Files: `src/runtime/monitors.ts`, `src/runtime/query.ts` (`has`/`members`), `src/runtime/app.ts`, `src/runtime/schedule.ts`

## ✅ Phase 9 — Traits runtime

- [x] `ResolvedTraits` (stable id → impl ctor+jecsId) built at finalize from `rovy.registry.traits` + componentMap
- [x] `TraitQueryHandle` (implements `QueryLike`): candidates = union of impl-bearing entities ∩ structural (no `jecs.Or`); `Trait<T>` → one row per present impl; `AllTraits<T>` → one row/entity + array; `HasTrait<T>` filter
- [x] `QueryLike` interface unifies QueryHandle/Filtered/Trait; App routes trait-using descriptors via `descriptorUsesTraits`; tick+trait combo asserts unsupported
- [x] Trait monitors work through reconcile over `TraitQueryHandle.members()` (per-entity; public-API design, not per-impl wiring)
- [x] `traitToken` already in `rovy` (Phase 1)
- [x] **Exit:** `test/specs/phase9.luau` 4/4 — Stunned+Rooted→2 `Trait` rows, AllTraits 1 row/entity+array, HasTrait filter, trait monitor enter/exit; fixed stale phase5 (→ HasPair)
- Files: `src/runtime/traits.ts`, `src/runtime/query.ts` (`QueryLike`), `src/runtime/app.ts`, resolve-param/scheduler/monitors typing

## ✅ Phase 10 — Relationships

- [x] `registerRelation` → jecs relation id; native `Exclusive` + `pair(OnDelete/OnDeleteTarget, Delete/Remove)` for policies; `world.relate/unrelate/hasRelation/getRelation/relationTarget`; `commands.relate/unrelate` deferred hooks wired
- [x] `RelationQueryHandle` (QueryLike): candidates via `jecs.each(pair(Rel,Wildcard))`; `Pair<R>` binds `{target,data}`; `HasPair<R>` filter; `withTarget(e)` clones pinned to target; relationship monitors via reconcile/members
- [x] App routes pair/hasPair descriptors → RelationQueryHandle (before trait/structural)
- [x] QueryHandle constructor now asserts component/Optional terms are registered (caught at start)
- [x] **Exit:** `test/specs/phase10.luau` 4/4 — tag+data round-trip (world+commands), exclusive drops prior, cascade despawns holder, Pair binds target / HasPair filters / withTarget narrows; phase5 canary repurposed to unregistered-component invariant
- Files: `src/runtime/relations.ts`, `src/runtime/world.ts`, `src/runtime/app.ts`, `src/runtime/query.ts`

## ✅ Phase 11 — Plugins + loadPaths hardening + dev errors

- [x] `@plugin` decorator (no-op marker) + `app.addPlugin({build})`; `plugin.build(app)` runs first in `start()` → `configureSets`/`insertResource` before finalize
- [x] Dev validation pass: systems/observers/monitors with `res`/`resMut`/`eventReader`/`eventWriter` for unregistered deps throw a **named** error (`'sys/Id' needs unregistered @resource: X`); `optRes` tolerant
- [x] `loadPaths` default provider requires Instance-tree ModuleScripts (Roblox `require` caches → side effects once); injected provider for Lune tests; registries additive + single `start()` guard cover idempotency/cycles
- [~] `Object.freeze` on `Res` — **deferred** (locked decision: `ResMut` advisory-only v1; no runtime freeze)
- [~] Real Instance-tree TestEZ/run-in-roblox suite — **deferred** (no Studio in CI; injected-provider path fully covered under Lune; real walk is thin glue, low risk — tracked for when a Roblox CI exists)
- [x] **Exit:** `test/specs/phase11.luau` 5/5 — plugin configures sets + inserts resource pre-finalize; unregistered @resource/@event throw named; OptRes tolerant; loadPaths delegates
- Files: `src/runtime/app.ts` (validation + plugin order), `src/runtime/events.ts` (`hasEvent`), `src/decorators.ts` (`plugin`)

## ✅ Phase 12 — Integration / example app

- [x] Hand-wired combat scenario (`rovy.__*`, no transformer): components + `@resource` Clock + `@event` DamageTaken + 3 systems across ordered sets (Clock/Attack/Damage/Death) + EventWriter/Reader + deferred commands + 2 monitors (death-count + reaper-despawn)
- [x] N-tick deterministic run: 25hp / 10dmg → dies tick 3, monitor onEnter once, target despawned, resMut clock = 3, further ticks no-op
- [x] Fixed scheduler: final flush+reconcile per run so trailing commands from the last set's reconcile (monitor despawn) apply same run even when later sets are empty/skipped
- [x] **Exit:** `test/specs/phase12.luau` 1/1 (combat) green
- Files: `test/specs/phase12.luau`, `src/runtime/schedule.ts` (final flush)

> **✅ Milestone 2 COMPLETE (Phases 7–12). ✅ `@rovy/core` COMPLETE (Phases 0–12).** 56/56 specs green under Lune. Commits `3bbe6e3`→`5400bd4`.

---

# Milestone 3 — External Signal Bridge (Phases 13–15)

## ✅ Phase 13 — Collector contract + decorator + transformer lowering

- [x] Added `@collect` no-op decorator to `packages/core/src/decorators.ts` and exported it from `packages/core/src/index.ts`
- [x] Extended frozen contract with `CollectReg`, `CollectParam`, `registry.collectors`, and bumped `CONTRACT_VERSION` to `2`
- [x] Added `rovy.__collect(ctor, id)` registry entry point and reset coverage
- [x] Transformer now recognizes `@collect`, injects `rovy.__collect(...)`, and lowers collector class params to `{ kind = "collect", ctor = ... }`
- [x] Transformer preserves observer first-param event precedence over collector matching
- [x] `packages/core/src/__typecheck.ts` now exercises collector params in system / observer / monitor authoring positions
- [x] **Exit:** transformer fixture coverage proves `__collect` injection and collect-param lowering in system / observer / monitor contexts

## ✅ Phase 14 — Runtime collector store + param resolution

- [x] `App` now owns app-scoped singleton collector instances keyed by ctor
- [x] Collectors instantiate once during `app.start()` and are injected through shared param resolution into systems, observers, and monitors
- [x] Collector-only apps are now valid in the empty-registry assertion
- [x] Runtime validation fails loudly for unregistered collector params and collector instances missing callable `drain()`
- [x] No teardown lifecycle in v1; collectors live for the full `App` lifetime
- [x] **Exit:** new runtime specs cover singleton injection, queue persistence across runs, collector-only boot, and named validation failures

## ✅ Phase 15 — Integration tests + docs promotion

- [x] Added new core specs for collector registry contract, runtime injection/validation, and buffered-event + trigger integration flow
- [x] Added transformer regression coverage for `@collect` lowering and zero-arg constructor validation
- [x] Promoted docs from proposal wording to shipped collector feature wording across README / API / package / events / observers / systems docs
- [x] Updated roadmap docs to point at implemented collector support
- [x] **Exit:** required test suites for `rovy-transformer` and `@rovy/core` are green with collector coverage added

> **✅ Milestone 3 COMPLETE (Phases 13–15).** `mise exec -- pnpm --filter rovy-transformer test` green, `mise exec -- pnpm --filter @rovy/core test` green, and core spec count now sits at 64/64.

# Milestone 4 — Networking Package MVP (Phase 16)

## ✅ Phase 16 — Package extension params + `@rovy/networking` scaffold

- [x] Added net-neutral external injected param descriptors to `@rovy/core`: `{ kind: "external", id }`
- [x] Added `app.insertParam(id, value)` and scheduler/runtime resolution for package-owned injected params
- [x] Added core spec coverage for external param injection and missing-param errors
- [x] Added `packages/networking` as `@rovy/networking`
- [x] Added `netEvent`, `rovyNet.__netEvent`, `NetRuntime`, `NetClient`, `NetServer`, `NetEventContext`, `NetPlugin`, `NetId`
- [x] Transformer now recognizes `@netEvent` from `@rovy/networking`, emits both `rovy.__event(...)` and `rovyNet.__netEvent(...)`, and lowers `NetClient` / `NetServer` / `NetEventContext` params through external ids
- [x] Transformer generates Blink schema metadata strings for `@netEvent` constructor payloads, including Blink-required comma-separated struct fields
- [x] Added transformer Blink integration test that extracts generated `.blink` schema, runs real Blink CLI, and asserts client/server/types Luau outputs exist
- [x] **Exit:** `mise exec -- pnpm test`, `mise exec -- pnpm run test:integration`, and `mise exec -- pnpm run test:zombie` green

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

---

## Risks

- jecs internal-API reality (`world.observable`, 4-arg `added`, `archetype_traverse_remove`) — Phase 0 spike + vendored d.ts; blocks 7–9 if upstream absent (fallback: per-frame archetype poll, redesign exit detection)
- Variadic tuple inference for `Query<[Terms],...Filters>` — validated Phase 1 type level
- Monitor `Without` inverted hook correctness — Phase 8 exit covers it
- Flush determinism under observer-produced commands — Phase 6 convergence tests
- Lune ≠ full Roblox API — injectable `loadPaths` provider; real path in Phase 11 TestEZ layer

## Verification

- Per phase: `@rbxts/jest` specs under Lune meeting that phase's exit criteria; build clean
- Milestone 1: hand-wired spawn→query→scheduled-system→event/observer scenario green under Lune
- Milestone 2 / Phase 12: full doc-13 combat integration deterministic across N ticks; Phase 11 TestEZ/run-in-roblox confirms real Instance-tree `loadPaths` + boot
- Phase 0 spike report reviewed before starting Phase 7

## How to use this tracker (for any AI/dev)

1. Pick the lowest ⬜ phase (respect dependency order; don't skip spike-gated 7–9 before Phase 0 spike reviewed).
2. Set its emoji to 🟨, work the checkboxes top-down.
3. Meet the **Exit** criterion with passing specs before flipping to ✅.
4. Commit tracker updates alongside code so progress is shared.
