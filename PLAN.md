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

## ✅ Phase 0 — Scaffold + jecs spike + test harness

- [x] `package.json` (`name @rovy/core`, `main out/init.luau`, `types out/index.d.ts`, scripts `build/dev/test/spike`)
- [x] `tsconfig.json` (roblox-ts standard, `outDir out`, `rootDir src`, `plugins: []`)
- [x] `.gitignore` (`/node_modules /out /out-test /include *.tsbuildinfo`)
- [x] Rojo `default.project.json`; `mise.toml` pins lune 0.10.4 + rojo 7.6.1
- [x] Deps installed: `@rbxts/jecs@0.11.0`; dev: `roblox-ts@3.0.0`, `@rbxts/compiler-types@3.0.0-types.0`, `@rbxts/types`, `@rbxts/jest@3.16.0-ts.1`, `@rbxts/jest-globals`; lune via mise
- [x] **jecs API spike** → `test/spike-report.md` (full symbol table + mitigations)
- [x] Vendored `src/types/jecs-internal.d.ts` (minimal: `added/changed` 4th `oldarchetype` arg; `InternalWorld` view)
- [x] Substrate harness: `test/smoke.luau` green under Lune — jecs round-trip, with/without, **cached `has()`**, `record()`, **empirically confirms spike's 4-arg `added` claim**
- [x] **Exit:** `npm run build` emits `out/init.luau`; smoke spec passes under Lune; spike report committed

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

> **✅ Milestone 1 COMPLETE (Phases 0–6).** Usable core: spawn/query/scheduled-systems/events/observers green under Lune. 33/33 specs. Commits `3bbe6e3`→`<phase6>`.

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
