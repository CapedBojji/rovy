# `@rovy/core` Implementation Plan & Progress Tracker

> Living tracker. Any AI/dev can resume from here.
> Update the status emoji + check boxes as work lands. Keep this in sync with reality.

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done · ⛔ blocked

---

## Context

`/Users/reikan404/Documents/rovy` is spec-only: 21 design docs in `docs/`, no code yet. Design is frozen (registration-injection model: transformer injects `rovy.__*` side-effect calls, `rovy.loadPaths` force-requires modules, `app.start()` finalizes). Build the **runtime package `@rovy/core` first**, before `rovy-transformer`.

**Enabling insight:** core is fully buildable/testable WITHOUT the transformer — the `rovy.__*` API (docs 19/20) is a hand-writable contract; tests hand-write the calls the transformer would inject. That surface is the transformer↔runtime boundary, **frozen at Phase 1**.

Spec to keep open while implementing: `docs/19-compiled-output.md`, `docs/20-runtime-lifecycle.md`, `docs/16-change-detection.md`, `docs/18-monitors.md`, per-feature docs 02–11/17.

## Locked decisions

- **Test harness:** `@rbxts/jest` + `@rbxts/jest-globals` headless under **Lune**. `loadPaths` Instance-tree walk behind an injectable module-source provider so ~all specs stay Lune-pure.
- **StandardPlugin:** excluded from `@rovy/core` (separate optional package later). Core ships zero built-in schedules.
- **jecs internals:** vendor a `.d.ts` augmentation for internal jecs APIs (`world.observable[EcsOnArchetypeCreate/Delete]`, `jecs.archetype_traverse_remove`, `jecs.record`, `world.ROOT_ARCHETYPE`, 4-arg `world:added`). Phase 0 spike confirms upstream; augmentation makes them TS-callable.
- v1 open-question resolutions: forbid generics on `@system`/`@monitor`/`@observer`; `ResMut` advisory-only; `onChange` not deduped per step.

---

# Milestone 1 — Usable Core (Phases 0–6)

## ⬜ Phase 0 — Scaffold + jecs spike + test harness

- [ ] `package.json` (`name @rovy/core`, `main out/init.lua`, `types out/index.d.ts`, scripts `build: rbxtsc`, `dev: rbxtsc -w`, `test`)
- [ ] `tsconfig.json` (roblox-ts standard, `outDir out`, `rootDir src`, `plugins: []`)
- [ ] `.gitignore` (`/node_modules /out /include *.tsbuildinfo`)
- [ ] Rojo `default.project.json` + test place project
- [ ] Deps: `@rbxts/jecs`; dev: `roblox-ts`, `@rbxts/compiler-types`, `@rbxts/types`, `@rbxts/jest`, `@rbxts/jest-globals`; Lune runner
- [ ] **jecs API spike** → `test/spike-report.md`: symbol table {public-typed / public-untyped / internal / missing → mitigation} for `world:component/entity/add/set/get/remove/delete`, `world:query():with():without()`, query iteration, `query:archetypes()`, `world:added/removed/changed` **with exact callback arities** (esp. 4th `srcArchetype` on `added`), `world.observable[EcsOnArchetypeCreate/Delete]`, `jecs.record().archetype`, `jecs.archetype_traverse_remove`, `world.ROOT_ARCHETYPE`, `pair()`, `jecs.Wildcard`, `jecs.Or`
- [ ] Vendored `src/types/jecs-internal.d.ts` from spike
- [ ] Harness: Lune + `@rbxts/jest` green on trivial `world:entity()` spec
- [ ] **Exit:** `npm run build` emits Luau; trivial spec passes under Lune; spike report committed (**gates Phases 7–9**)

## ⬜ Phase 1 — Type surface + decorator/macro stubs + `rovy` skeleton (CONTRACT FREEZE)

- [ ] Type-only exports: `Query`, `Res`, `ResMut`, `OptRes`, `Trait`, `HasTrait`, `AllTraits`, `Pair`, `HasPair`, `Optional`, `With`, `Without`, `Changed`, `Added`, `Removed`, `Entity`, `Commands`, `World`, `EventReader`, `EventWriter`, `Local`, `SystemSet`
- [ ] Decorators = no-op markers
- [ ] `trait<T>()` / `query<...>()` = loud-throw stubs (doc 21 guard message)
- [ ] `rovy` object: registry tables + `__component/__resource/__event/__system/__observer/__monitor/__relation/__schedule/__traitImpl/__query/__traitQuery` + `loadPaths` (provider-injectable) + `traitToken` — pure data push
- [ ] **Frozen descriptor interfaces**; `param.kind ∈ {commands,world,query,res,resMut,optRes,eventReader,eventWriter,event,entity,term,local}`; `local` = `{kind:"local",index,init?}`; query param optional `filters`
- [ ] Freeze: `@observer` stacking → one entry+instance per decorator; `runIf` zero-arg v1
- [ ] **Exit:** hand-call `rovy.__*` populates registries; `loadPaths` over module array fires side effects; doc-13 `Query<[...],...F>` signatures type-check
- Files: `src/index.ts`, `src/decorators.ts`, `src/macros.ts`, `src/types/*.ts`, `src/rovy.ts`, `src/contract.ts`

## ⬜ Phase 2 — World wrapper + component & resource registry + finalize skeleton

- [ ] `World` wrapper over jecs `World()`: `spawn/despawn/insert/set/remove/has/get`, `componentMap` (TS ctor → jecs id)
- [ ] `App.start()` finalize steps 1–2: components → ids; resources → ids + auto-instantiate `ctor.new()` on `RESOURCE_ENTITY`; `app.insertResource` override; `world.resource(C)`
- [ ] Empty-registry assertion in `start()`
- [ ] **Exit:** hand-register 2 components + 1 resource → `start()` → spawn/get round-trips; resource default returned; `insertResource` overrides
- Files: `src/runtime/world.ts`, `src/runtime/app.ts`, `src/runtime/resources.ts`

## ⬜ Phase 3 — Commands buffer + flush

- [ ] `Commands`: `spawn/despawn/insert/set/remove` (real); `send/trigger/relate/unrelate/runSchedule` queued-but-stubbed
- [ ] Spawn bundle instance-vs-tag detection (doc 20)
- [ ] `flush()` convergence loop at boundaries
- [ ] **Exit:** deferred spawn/set invisible until `app.flush()`, then materialized; ordering verified
- Files: `src/runtime/commands.ts`, `src/runtime/flush.ts`

## ⬜ Phase 4 — Schedules + sets + scheduler + param resolver (the spine)

- [ ] `@schedule` finalize; `SystemSet`; `app.configureSets`
- [ ] `Schedule.run`: intra-set after/before topo sort; flush at set boundaries; `world.changeTick += 1` per schedule run
- [ ] `resolveParam` for `commands/world/res/resMut/optRes/local/entity`
- [ ] `runOnStart` fires in `start()`
- [ ] `commands.runSchedule` re-entrancy (nested run reuses flush loop, no extra changeTick bump until outer completes)
- [ ] **Exit:** system runs with resolved `Commands`/`Res`; after/before order across 3 systems; `Local<T>` persists; `runOnStart` fires once
- Files: `src/runtime/schedule.ts`, `src/runtime/system-set.ts`, `src/runtime/resolve-param.ts`

## ⬜ Phase 5 — Query runtime: structural terms + filters

- [ ] `buildJecsQuery`: terms, `Entity` strip, `With`/`Without`, `Optional`
- [ ] `QueryHandle`: `forEach/size/first/iterator`
- [ ] `{kind:"query",handle}` resolves; multi-query independent (no tick filters yet)
- [ ] **Exit:** `Query<[Entity,Position],With<Unit>,Without<Dead>>` correct rows; `Optional` binds undefined when absent; multi-query per system
- Files: `src/runtime/query.ts`, `src/runtime/query-handle.ts`

## ⬜ Phase 6 — Events + observers

- [ ] `@event` finalize → capacity-ring buffers; `EventReader`/`EventWriter`; `commands.send`
- [ ] `commands.trigger` deferred + `world.trigger` immediate
- [ ] Observer dispatch tables, priority sort at finalize; `dispatchToObservers` in `flush`
- [ ] Observer-produced triggers re-enter flush to convergence
- [ ] **Exit:** `send`→`EventReader` drains for run; priority order; trigger chain converges one flush; `world.trigger` inline; capacity drops oldest
- Files: `src/runtime/events.ts`, `src/runtime/observers.ts` (extend `flush.ts`, `resolve-param.ts`)

> **✅ Milestone 1 complete when Phases 0–6 done:** spawn, query, scheduled systems, events/observers working under Lune.

---

# Milestone 2 — Full Surface (Phases 7–12)

## ⬜ Phase 7 — Change detection (`Changed`/`Added`/`Removed`) — spike-gated

- [ ] Per-component `registerChangeDetection` at finalize (`changeStores`/`addedStores`/`removedBuffers`) on jecs `added/changed/removed`
- [ ] `FilteredQueryHandle` tick check vs `consumer.lastRunTick`
- [ ] `Removed<C>` drains buffer (Entity-only bind); prune at schedule-run boundary
- [ ] First-run `lastRunTick=-1` Bevy parity
- [ ] **Exit:** `Changed<Health>` only post-`set`; `Added`≠`Changed`; `Removed` once per removal/despawn; first run yields all
- Files: `src/runtime/change-detection.ts` (extend `query-handle.ts`)

## ⬜ Phase 8 — Monitors (archetype tracking + lifecycle) — highest risk, spike-gated

- [ ] Initial set via `query:archetypes()`; `observeArchetypes` via `world.observable`
- [ ] `onEnter/onExit/onChange` via `world:added/removed/changed` src/dst asymmetry (`jecs.record`, `archetype_traverse_remove`, `ROOT_ARCHETYPE`)
- [ ] Inverted `Without` logic; param resolution vs match terms
- [ ] **Exit:** gain `[Health,Position]+Unit`→`onEnter` once; lose `Health`→`onExit`; `set`→`onChange`; gain `Dead`(Without)→`onExit`; despawn→`onExit` via ROOT; new runtime archetype tracked live
- Files: `src/runtime/monitors.ts`

## ⬜ Phase 9 — Traits runtime

- [ ] `traitRegistry` at finalize; `__traitImpl/__traitQuery`
- [ ] `buildTraitQuery`→N sub-queries; `TraitQueryHandle` (row/impl)
- [ ] `AllTraits` (row/entity+array); `HasTrait` (Or of impl ids — `jecs.Or` from spike); `traitToken`
- [ ] Trait-monitor expansion (one wired monitor per implementer)
- [ ] **Exit:** `Stunned`+`Rooted`→2 rows `Trait<CC>`, 1 row+array `AllTraits`; trait monitor fires per impl
- Files: `src/runtime/traits.ts` (extend `monitors.ts`, `query.ts`)

## ⬜ Phase 10 — Relationships

- [ ] `@relation` finalize → pair ids; `commands.relate/unrelate` + `world.relate/unrelate/hasRelation/getRelation`
- [ ] `exclusive`/`onTargetDelete`/`onDelete` policies
- [ ] `Pair<R>` binds `{target,data?}`; `HasPair<R>`; `q.withTarget(e)`; relationship monitors
- [ ] **Exit:** tag+data relations round-trip; `exclusive` auto-removes prior; `cascade` despawns holder on target delete; `Pair<ChildOf>` binds target; `withTarget` narrows
- Files: `src/runtime/relationships.ts` (extend `commands.ts`, `query.ts`, `monitors.ts`)

## ⬜ Phase 11 — Plugins + loadPaths hardening + dev errors

- [ ] `@plugin` + `app.addPlugin(build(app))`; `configureSets` via plugins
- [ ] `loadPaths` recursive-require with circular-require safety
- [ ] Dev-mode unregistered-class error at finalize (names the class)
- [ ] Optional dev `Object.freeze` on `Res`/get
- [ ] Thin TestEZ/run-in-roblox suite for real Instance-tree `loadPaths`
- [ ] **Exit:** plugin configures sets; finalize on unregistered class throws clear named error; circular requires no deadlock; real ModuleScript tree walk works under TestEZ
- Files: `src/runtime/plugin.ts` (extend `rovy.ts`, `app.ts`), `test/instance-tree.testez`

## ⬜ Phase 12 — Integration / example app

- [ ] Hand-write doc-13 combat example's `rovy.__*` calls (proves transformer unneeded for core)
- [ ] `Heartbeat`-style loop; assert end-to-end deterministic state across N ticks
- [ ] **Exit:** cast → damage → death monitor → despawn → deterministic expected state
- Files: `test/integration/combat.spec.ts`

> **✅ Milestone 2 complete when Phases 7–12 done.**

---

## Risks

- jecs internal-API reality (`world.observable`, 4-arg `added`, `archetype_traverse_remove`) — Phase 0 spike + vendored d.ts; blocks 7–9 if upstream absent (fallback: per-frame archetype poll, redesign exit detection)
- Variadic tuple inference for `Query<[Terms],...Filters>` — validated Phase 1 type level
- Monitor `Without` inverted hook correctness — Phase 8 exit covers it
- Flush determinism under observer-produced commands — Phase 6 convergence tests
- Lune ≠ full Roblox API — injectable `loadPaths` provider; real path in Phase 11 TestEZ layer

## Verification

- Per phase: `@rbxts/jest` specs under Lune meeting that phase's exit criteria; `npm run build` clean
- Milestone 1: hand-wired spawn→query→scheduled-system→event/observer scenario green under Lune
- Milestone 2 / Phase 12: full doc-13 combat integration deterministic across N ticks; Phase 11 TestEZ/run-in-roblox confirms real Instance-tree `loadPaths` + boot
- Phase 0 spike report reviewed before starting Phase 7

## How to use this tracker (for any AI/dev)

1. Pick the lowest ⬜ phase (respect dependency order; don't skip spike-gated 7–9 before Phase 0 spike reviewed).
2. Set its emoji to 🟨, work the checkboxes top-down.
3. Meet the **Exit** criterion with passing specs before flipping to ✅.
4. Commit tracker updates alongside code so progress is shared.
