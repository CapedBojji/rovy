# `@rovy/ui` — Test Coverage Plan

Retained, class-based UI runtime for the rovy ECS. This document is the detailed
map of what is tested, how, and where the two test surfaces live:

1. **Zune unit/integration specs** (`packages/ui/test/`) — run headless against
   the compiled `out/init.luau` under a fake-Instance harness with a real
   `@rovy/core` App. This is the bulk of coverage.
2. **Studio MCP validation** (`~/Documents/rovy-ui-proof-place`) — the
   rojo-synced proof place that exercises the *shipped* package inside Roblox
   Studio and self-reports PASS/FAIL. See [§7](#7-studio-mcp-validation).

Run: `pnpm --filter @rovy/ui test` (builds core + ui, then `zune test test/run`).
Current status: **194 checks across 22 spec files.**

---

## 1. Harness architecture

| File | Role |
|------|------|
| `test/run.luau` | Entry; delegates to the shared `spec_runner`. |
| `test/harness/runtime.luau` | Fake-Instance roblox-ts RuntimeLib. Adapted from the imgui harness: filesystem-backed module graph resolving `@rovy/core` → `../core/out`, `@rovy/jecs` → `../jecs`, `@rbxts/*`. Adds: a **controllable `task.defer` shim** (queue + `__rovyDrainTasks`/`__rovyPendingTasks`), fake `Instance`/signals/services, and a real `Players.LocalPlayer/PlayerGui` so the auto-ScreenGui path is exercised. |
| `test/harness/helpers.luau` | `Helpers.load(TS)` returns `H` with: the ui module + macros, the core `App`/`rovy` registry, `uiClass()`/`class()` fixture builders, `startedApp()`, `settle()`, a `rerenderResource()`/`bump()` re-render driver, and instance-tree walkers. |

**Why manual fixtures.** `@ui` classes and `$…Trigger` macros are normally lowered
by `rovy-transformer` into `rovyUi:__ui(ctor, { id, methods:["render"], params,
triggers })`. The specs register that *exact metadata shape by hand* (mirroring
the core specs' `class()` idiom) and build trigger descriptors with the real
exported macros — so we test the runtime against authentic transformer output
without needing the transformer in the loop.

**Determinism.** The runtime's only async touch is `scheduleFlush → task.defer`.
The shim queues those callbacks; `H.settle(app)` drains the queue and runs
`app:flush()` (→ `on_post_flush` → `flushDirty`) so every re-render lands
synchronously and is asserted immediately.

---

## 2. Coverage matrix — runtime surface → specs

| Runtime area (`src/index.ts`) | Spec | Cases |
|---|---|---|
| `native`/`child`/`fragment`, element helpers, `jsx`/`jsxs`/`Fragment`, prop & child normalization | `01_vnodes` | 15 |
| `rovyUi.__ui` / `__reset` / `__callsite`, `findUiReg`, unregistered/unstarted errors | `02_registry` | 8 |
| `mountUi`, `mountNative`/`mountComponent`/`mountFragment`, `resolveTarget`/`defaultGuiName`/`getPlayerGui` | `03_mount` | 15 |
| `patchNativeProps`/`setNativeProp`/`clearNativeProp`, `ref`, no-op skip | `04_native_props` | 5 |
| `patchEvents` (connect/swap/drop/clear/ignore/destroy) | `05_events` | 8 |
| `reconcileNode`/`reconcileChildren`, `sameIdentity`/identity keys, keyed reorder/remove/remount | `06_reconcile` | 15 |
| `reconcileComponent`/`updateProps` (true/false → render or skip) | `07_props_update` | 4 |
| `$resourceTrigger` (descriptor, re-render, unsub) | `08_triggers_resource` | 3 |
| `$componentTrigger` (entity binding, `on` filter, descriptor defaults) | `09_triggers_component` | 12 |
| `$queryTrigger` (snapshot diff add/change/remove, `on` filter, missing handle) | `10_triggers_query` | 16 |
| `$eventTrigger` (descriptor, observe, post-flush, unregistered) | `11_triggers_event` | 6 |
| `$relationTrigger` (source/target binding, descriptor defaults, `on` filter) | `12_triggers_relation` | 12 |
| `$lifecycleTrigger` (descriptor defaults, ctor option) | `13_triggers_lifecycle` | 5 |
| `$propsTrigger` (no-op subscription) | `14_triggers_props` | 2 |
| `markDirty`/`scheduleFlush`/`flushDirty` batching, dedupe, idempotent drains, throwing-render isolation/self-heal | `15_scheduling` | 8 |
| `resolveParams` injection + `Local<T>` persistence/isolation | `16_params` | 4 |
| `destroyMountedUi`/`destroyNode`, conditional subtree teardown, idempotency | `17_destroy` | 3 |
| `registerPostStartAppExtension`/`consumeMountRequests` + `app.mount` | `18_mount_requests` | 7 |
| End-to-end proof-panel lifecycle | `19_integration` | 2 |
| Private destroyed guards, identity mismatches, and nil-bound event paths | `20_internal_paths` | 4 |
| Runtime roots, portals, GUI collector hosts, target moves, and keyed portal lifecycles | `21_portals` | 5 |

---

## 3. Injection coverage (the "injections work" requirement)

Every param `kind` the ui render path can resolve is asserted to arrive in
`render(self, …)` in declared order:

- `world`, `commands`, `res`, `query` — value/identity checked (`16_params`,
  and used throughout the trigger specs to read the ECS in render).
- `local` — persists across re-renders of a node and is isolated per mount.
- All seven triggers feed the same injection path, so each trigger spec doubles
  as an injection assertion (e.g. component trigger renders read `world:get`,
  query trigger renders read `q:size()`).

## 4. Re-render coverage (the "rerenders work" requirement)

- **Fires**: each trigger kind re-renders on its event (§2 rows 8–14).
- **Scoping**: component/relation triggers re-render *only* for the bound
  entity/pair; `on` filters suppress non-selected event kinds.
- **Batching**: two triggers firing in one flush → one render (dedupe); distinct
  nodes each render once; no-op flush renders nothing; extra drains never
  double-render (`15_scheduling`).
- **Prop-driven**: parent re-render forwards new props → child re-renders only on
  a real change (`updateProps` true/false, `07_props_update`).
- **Reconciliation under re-render**: same identity reuses the instance, className
  change replaces it, keyed rows survive reorder and are destroyed when dropped
  (`06_reconcile`), verified again end-to-end in `19_integration`.

## 5. Lifecycle / cleanup coverage

- Trigger subscriptions and event connections are released on `destroy`; a
  destroyed tree neither re-renders nor errors on further world activity.
- Conditional subtrees (`cond and node or false`) mount/destroy across renders.
- Auto-created ScreenGui is destroyed with the handle; `destroy` is idempotent.
- Portal children are destroyed with their logical tree while external targets
  remain owned by the caller; keyed portals move retained children between
  targets without resetting them.

## 5a. Render failure resilience

`flushDirty` pcall-isolates each dirty node's `render()` (`15_scheduling`,
"render failure resilience"):

- A throwing render warns (`[rovy/ui] render failed for '<id>': <error>`) and
  does not propagate out of `app:flush()`.
- A sibling node dirtied in the same flush still renders — one bad component
  can't starve the rest of the batch.
- `state.flushing` is always reset, so a failed flush does not wedge future
  re-renders for the mount (self-heals on the node's next trigger).
- Mount-time (`mountComponent`) and prop-driven (`reconcileComponent`) renders
  are deliberately left fail-fast — isolation only applies to the scheduled
  flush loop, per the locked "isolate + warn + continue" scope.

## 6. Known-behaviour characterizations

Documented, deliberately-asserted current behaviours (not bugs, but pinned so a
change is noticed):

- `clearNativeProp` only fully resets the `events` key; a dropped **plain** prop
  is left on the instance until re-set (`04_native_props`).

---

## 7. Studio MCP validation

The proof place `~/Documents/rovy-ui-proof-place` is rojo-synced to the user's
Studio test place and consumes the **built** `@rovy/ui` tgz. Its
`src/client/main.client.ts` is a self-checking harness that drives the same
scenarios as `19_integration` against real Roblox instances and publishes:

- `ScreenGui.RovyUiProofGui` attribute `RovyUiProofStatus` = `RUNNING` →
  `PASS`/`FAIL`
- attribute `RovyUiProofDetails` = failing check names (or success message)
- console: `[RovyUiProof] PASS: …`

**Validation steps via the `robloxstudio` MCP** (see availability note below):

1. Ensure the built package is current: from repo root
   `pnpm pack:local`, then in the proof place `pnpm install` + `rovy build`
   (or rely on the running `rovy watch`). Only needed if `packages/ui/src`
   changed since the last pack.
2. Play the place in Studio.
3. Read `game.StarterGui`/`PlayerGui`'s `RovyUiProofGui` attributes; assert
   `RovyUiProofStatus == "PASS"`.
4. Read the `RovyUiProofPanel` TextLabel tree and confirm the row/badge texts
   match the expected end-state.

Studio validation requires a connected proof-place edit session. If the only
connected session is unrelated, leave it untouched and connect the proof place
before continuing. Inspect connected sessions and local place locks first so the
same place is never launched twice.
