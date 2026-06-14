# Packages — core, networking, datastore, ui, world inspector, and transformer

Rovy ships as distinct packages, mirroring the split between runtime packages and build-time transformer tooling:

| Package                 | Role                                                           | You interact with it by                                   |
| ----------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `@rovy/core`            | Decorators, macros, types, **and the packaged runtime**        | `import` it and write code                                |
| `@rovy/networking`      | Net-event authoring surface and runtime handles                | `import` it when using `@netEvent`                        |
| `@rovy/datastore`       | Persistent document declarations and runtime handles           | `import` it when using persistent documents               |
| `@rovy/ui`              | Widget/render integration package                              | `import` widget helpers and JSDoc-tagged widget functions |
| `@rovy/world-inspector` | In-game ECS inspection and editing plugin                      | `import` it when embedding the debug inspector            |
| `rovy-transformer`      | roblox-ts compiler transformer plugin                          | Listing it in `tsconfig.json`                             |
| `rovy-build`            | build/open/watch/start orchestration and Rovy config discovery | Use it in package scripts                                 |

Most ECS code authors against `@rovy/core`. Networked event code additionally
imports `@rovy/networking`. Persistent game data code imports
`@rovy/datastore`. UI code authors against `@rovy/ui`. Debug tooling can
additionally import `@rovy/world-inspector`. `rovy-transformer` runs
silently at build time and rewrites decorated and widget code into the runtime
calls the packages consume. `rovy-build` owns the project command flow around
`rbxtsc`, generators, Rojo, and Studio.

Inside this repo, the shipped packages live in a pnpm workspace at
`packages/core`, `packages/networking`, `packages/datastore`, `packages/ui`,
`packages/world-inspector`, `packages/transformer`, and `packages/build`.

## What lives in `@rovy/core`

Everything you import:

- **Decorators** — `@component`, `@collect`, `@resource`, `@event`, `@system`, `@observer`, `@monitor`, `@relation`, `@schedule`, `@set`, `@plugin`
- **Planned decorator** — `@prefab`
- **Macros** — `trait<T>()`, `query<...>()`
- **Type-only helpers** — `Query<...>`, `Res<T>`, `ResMut<T>`, `OptRes<T>`, `Trait<T>`, `HasTrait<T>`, `AllTraits<T>`, `Pair<R>`, `Optional<C>`, `With<C>`, `Without<C>`, `Changed<C>`, `Added<C>`, `Removed<C>`, `Entity`, `Commands`, `World`, `EventReader<E>`, `EventWriter<E>`, `Local<T>`, `SystemSet`
- **Runtime** — `App`, the `World` wrapper, `Commands`, scheduler, observer/monitor dispatch, lifecycle hooks, event buffers, resource store, change-detection stores, trait registry
- **Debug helpers** — `LifecyclePrintPlugin` for opt-in lifecycle logging
- **The `rovy` registry object** — `rovy.loadPaths(...)` (public; authored TS passes string paths that the transformer lowers to Instance roots) plus the `rovy.__component` / `__collect` / `__prefab` / `__resource` / `__event` / `__system` / `__observer` / `__monitor` / `__relation` / `__schedule` / `__traitImpl` / `__query` / `rovy.traitToken` entry points (transformer-only — never hand-called; `__prefab` is planned)

```ts
import { App, component, system, Query, Res, rovy } from "@rovy/core";
```

The runtime is _packaged inside_ `@rovy/core`. There is no separate runtime package — the transformer targets the API surface that core already exports.

## What lives in `@rovy/networking`

Networking is separate from core. Import it only when a package needs net events:

- **Decorator** — `@netEvent(...)`
- **Runtime handles** — `NetClient`, `NetServer`, `NetEventContext`, `NetRuntime`, `NetPlugin`
- **Registry** — `rovyNet.__netEvent(...)` is transformer-injected; users should not hand-call it
- **Types** — `NetId`, `ClientToServerNetEvent`, `ServerToClientNetEvent`

```ts
import { NetClient, netEvent } from "@rovy/networking";
```

`@netEvent` implies a core `@event`: the transformer emits both `rovy.__event(...)` and `rovyNet.__netEvent(...)`.

## What lives in `@rovy/datastore`

Datastore is separate from core. Import it only when a package needs persistent
documents:

- **Declarations** — `playerDocument<T>()`, `document<T, Owner>()`, and `sharedDocument<T>()`
- **Runtime handles** — `DocumentReader<D>`, `DocumentWriter<D>`, and `DocumentOpener<D>`
- **Lifecycle events** — `DocumentOpened<D>`, `DocumentOpenFailed<D>`, `DocumentChanged<D>`, `DocumentSaved<D>`, `DocumentSaveFailed<D>`, and `DocumentClosed<D>`
- **Registry** — `rovyData.__document(...)` is transformer-injected; users should not hand-call it
- **Runtime** — queued open/close/save processing through package-installed `DataStoreSet`

```ts
import { playerDocument, type DocumentWriter } from "@rovy/datastore";
```

Document declarations are transformer-backed. The transformer generates runtime
validators from datastore-safe TypeScript data types and lowers injected
document handle params to external package param ids.

## What lives in `@rovy/ui`

`@rovy/ui` is the TypeScript-authored widget/render integration package.

- **Runtime model** — Rovy-owned immediate UI runtime inspired by EgooE/Plasma, with no `@rbxts/egooe` dependency
- **Built-in catalog** — `window`, `button`, `checkbox`, `slider`, `input`, `label`, `table`, `popup`, `demoWindow`, and related layout/control helpers
- **Public authoring primitive** — built-in widget functions plus custom JSDoc-tagged widget functions
- **Authoring style** — plain calls such as `Window({ title: "Inventory" })`
- **Not the public model** — widget classes, `new Window()`, `RovyUi.Window(...)`
- **State model** — function-first widgets with compile-keyed helpers like `useState`, `useEffect`, and `useInstance`
- **Transformer contract** — widget functions are wrapped through `RovyUi.__widget(...)`, widget calls lower through `RovyUi.__scope(...)`, and storage helpers lower to keyed internals for stable identity

This package is meant to feel closer to EgooE's function-driven rendering style than to a React component tree, while still using Rovy's registration, identity, and injection machinery. Runtime does not use `debug.info(...)` for identity; transformer keys own that job.

The full UI docs now live in the [Rovy UI section](/packages/ui), including [Built-in Widgets](/packages/ui/built-in-widgets), [Curve Editor](/packages/ui/curve-editor), [Styling](/packages/ui/styling), and [Custom Widgets](/packages/ui/custom-widgets).

## What lives in `@rovy/world-inspector`

`@rovy/world-inspector` is an optional debug package built on top of
`@rovy/networking` and `@rovy/ui`.

- **Client plugin** — `WorldInspectorPlugin`
- **Server plugin** — `WorldInspectorServerPlugin`
- **Events** — `ShowWorldInspector`, `HideWorldInspector`, `ToggleWorldInspector`
- **State and DTO helpers** — target choices, snapshots, and edit payloads
- **UI** — packaged inspector widget and runtime integration
- **Remote behavior** — snapshot and edit requests over inspector-specific net events

Use it when you want a live, in-game ECS debugging surface for local worlds,
server worlds, or another player's client world.

## What `rovy-transformer` does

A roblox-ts custom transformer. Pure build-time. It never ships to the game. Duties (full list in [Transformer](/runtime/transformer.md)):

1. Scan decorated classes.
2. Resolve `trait<T>()` / `query<...>()` / `Trait<T>` via `TypeChecker`.
3. Hoist `Query<...>` / `query<...>()` to module-level descriptors.
4. Inject a `rovy.__*` registration call after each decorated class.
5. Rewrite `trait<T>()` → `rovy.traitToken("stable/path")`.
6. Validate decorator usage (observer field exclusivity, monitor param order, `@resource` defaulted ctor, planned `@prefab` zero-arg ctor + `build(...)` shape).
7. Datastore support: lower document declarations, generate validators, generate lifecycle event constructors, and lower `DocumentReader` / `DocumentWriter` / `DocumentOpener` params to external package ids.
8. UI support: detect JSDoc `@widget` functions, inject widget registration, wrap them through `RovyUi.__widget(...)`, lower plain/custom and built-in widget calls through `RovyUi.__scope(...)`, lower storage helpers to keyed internals, and lower style sugar.

## How they connect

```txt
            authored against @rovy/core
src/*.ts  ──────────────────────────────┐
  @component class Position {}           │
  @system class MoveUnits { run(q: Query<...>) {} }
                                         │
                 rovy-transformer (build) │  reads decorators + types
                                         ▼
src/*.lua  (emitted)                     │
  class Position {}                      │
  rovy.__component(Position, "…")        │  injected registration calls
  class MoveUnits {}                     │  targeting @rovy/core's rovy.__*
  rovy.__system(MoveUnits, {…})          │
                                         ▼
            @rovy/core runtime            consumes registrations at
  rovy.loadPaths(...) → app.start()       loadPaths + finalize
```

The transformer↔runtime contract is the `rovy.__*` API exported by `@rovy/core`. Both sides are versioned together.

For UI work, the equivalent boundary is the `RovyUi.__widget(...)` wrapping contract plus the lowered plain-call widget authoring described in [Rovy UI](/packages/ui).

## Setup

Install the core runtime, transformer, and build orchestrator:

```sh
npm i @rovy/core
npm i -D rovy-transformer rovy-build
```

Install networking only when using net events:

```sh
npm i @rovy/networking
```

Install datastore only when using persistent documents:

```sh
npm i @rovy/datastore
```

Install UI only when using widget authoring:

```sh
npm i @rovy/ui
```

Install the inspector only when using the in-game debug tool:

```sh
npm i @rovy/world-inspector
```

Register the transformer in `tsconfig.json` (roblox-ts reads `compilerOptions.plugins`):

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "transform": "rovy-transformer"
      }
    ]
  }
}
```

Then keep build, environment, Rojo, boundary, and Blink settings in `package.json` under `rovy-build`:

```json
{
  "rovy-build": {
    "current": "dev",
    "placeFile": "game.rbxl",
    "rbxtscArgs": ["--type", "game"],
    "rojoBuildArgs": ["build", "default.project.json", "-o", "game.rbxl"],
    "watchOnOpen": true,
    "generateBlink": true,
    "environments": {
      "dev": {
        "rojo": "default.project.json",
        "boundaries": {
          "server": ["src/server"],
          "client": ["src/client"],
          "shared": ["src/shared"]
        },
        "net": {
          "strictBoundaryChecks": true,
          "transport": "blink",
          "blink": {
            "enabled": true,
            "remoteScope": "ROVY",
            "manualReplication": true,
            "usePolling": true
          }
        }
      }
    }
  }
}
```

That is the only transformer touchpoint in `tsconfig.json`. `rovy-build` handles compile, generation, Rojo build, open, and watch. When networking is enabled, it generates Blink files into `out/shared/net/generated/*`, so users only author decorators and injected params.

## What `rovy-build` does

`rovy-build` is the project command orchestrator. It installs a `rovy` CLI and
reads the active `package.json` `rovy-build` config before every command. That
keeps `rbxtsc`, Rovy generators, Rojo, Studio opening, watch mode, and environment
selection on one config surface.

Typical package scripts:

```json
{
  "scripts": {
    "compile": "rovy compile",
    "generate": "rovy generate",
    "build": "rovy build",
    "watch": "rovy watch",
    "open": "rovy open",
    "start": "rovy start",
    "stop": "rovy stop"
  }
}
```

| Command         | Orchestrated work                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `rovy compile`  | Runs `rbxtsc` with `rbxtscArgs`; then runs generation unless disabled.                                                  |
| `rovy generate` | Runs Rovy generators only. Blink generation writes `out/shared/net/generated/*` when enabled.                           |
| `rovy build`    | Runs `compile`, then `rojo` with `rojoBuildArgs` to create `placeFile`.                                                 |
| `rovy watch`    | Starts `rojo serve`, optional sourcemap watch, and `rbxtsc -w`; regenerates Blink outputs when compiled output changes. |
| `rovy open`     | Opens `placeFile` in Studio; starts watch too unless `watchOnOpen` is `false`.                                          |
| `rovy start`    | Runs `build`, then `open`.                                                                                              |
| `rovy stop`     | Kills tracked watch/Studio processes from `.rovy-build/*.pid`.                                                          |
| `rovy init`     | Adds default `rovy-build` config and scripts to the current package.                                                    |

Important config fields:

| Field                       | Meaning                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `current`                   | Default environment when `ROVY_ENV` is unset.                       |
| `placeFile`                 | Place file path opened by `open` / `start`.                         |
| `rbxtscArgs`                | Extra args passed to `rbxtsc`; most games use `["--type", "game"]`. |
| `rojoBuildArgs`             | Args passed to `rojo` during `rovy build`.                          |
| `watchOnOpen`               | Whether `rovy open` also starts watch mode.                         |
| `generateBlink`             | Whether compile/watch should run Blink generation.                  |
| `environments.*.rojo`       | Rojo project used by watch, sourcemap, and path lowering.           |
| `environments.*.boundaries` | Source roots for server/client/shared boundary checks.              |
| `environments.*.net`        | Networking transport and Blink settings.                            |

Set `ROVY_ENV=prod` or another environment name to select a different
`environments` entry for one command.

## Macro / decorator stubs (transformer-not-run guard)

Decorators and macros are real exports in `@rovy/core`, but their _meaningful_ behavior is the transformer-injected code. If the transformer did not run, the stubs fail loudly rather than silently misbehaving — same pattern as Flamework's "Macro was not transformed" error.

```ts
// @rovy/core (conceptual)
export function trait<T>(): TraitToken {
  throw "[rovy] trait<T>() reached runtime untransformed — is rovy-transformer in tsconfig plugins?";
}

export function query<
  T extends unknown[],
  F extends unknown[] = [],
>(): QueryToken {
  throw "[rovy] query<...>() reached runtime untransformed — is rovy-transformer in tsconfig plugins?";
}

// decorators are no-ops on their own; the injected rovy.__* call does the work
export function component(ctor: object) {
  /* marker only */
}
```

So a missing/misconfigured transformer surfaces as an immediate, explicit error at first macro hit — not as silently-unregistered systems.

## Why split

- **Runtime stays importable & typed.** Game code depends only on `@rovy/core`; no build magic needed to read the API.
- **Transformer is a dev dependency.** It is never bundled into the place file.
- **One contract.** The `rovy.__*` surface is the single boundary; either side can be reimplemented as long as it honors it.
- **Mirrors Flamework.** Familiar to roblox-ts devs: code against core, list the transformer in tsconfig, done.

## See also

- [Overview](/guide/overview.md)
- [Transformer](/runtime/transformer.md) — full build-time duty list
- [Compiled output](/runtime/compiled-output.md) — what the transformer emits
- [Runtime lifecycle](/runtime/lifecycle.md) — how the runtime consumes it
- [API reference](/reference/api.md)
- [Datastore](/packages/datastore.md)
- [Prefabs](/concepts/prefabs.md)
- [Rovy UI](/packages/ui)
- [World Inspector](/packages/world-inspector.md)
