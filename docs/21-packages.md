# Packages — core, networking, ui, and transformer

Rovy ships as distinct packages, mirroring the split between runtime packages and build-time transformer tooling:

| Package | Role | You interact with it by |
|---------|------|-------------------------|
| `@rovy/core` | Decorators, macros, types, **and the packaged runtime** | `import` it and write code |
| `@rovy/networking` | Net-event authoring surface and runtime handles | `import` it when using `@netEvent` |
| `@rovy/ui` | Widget/render integration package | `import` widget helpers and JSDoc-tagged widget functions |
| `rovy-transformer` | roblox-ts compiler transformer plugin | Listing it in `tsconfig.json` and pointing it at `.rovy.json` |

Most ECS code authors against `@rovy/core`. Networked event code additionally imports `@rovy/networking`. UI code authors against `@rovy/ui`. `rovy-transformer` runs silently at build time and rewrites decorated/widget code into the runtime calls the packages consume.

Inside this repo, the shipped packages live in a pnpm workspace at `packages/core`, `packages/networking`, `packages/ui`, and `packages/transformer`.

## What lives in `@rovy/core`

Everything you import:

- **Decorators** — `@component`, `@collect`, `@resource`, `@event`, `@system`, `@observer`, `@monitor`, `@relation`, `@schedule`, `@set`, `@plugin`
- **Planned decorator** — `@prefab`
- **Macros** — `trait<T>()`, `query<...>()`
- **Type-only helpers** — `Query<...>`, `Res<T>`, `ResMut<T>`, `OptRes<T>`, `Trait<T>`, `HasTrait<T>`, `AllTraits<T>`, `Pair<R>`, `Optional<C>`, `With<C>`, `Without<C>`, `Changed<C>`, `Added<C>`, `Removed<C>`, `Entity`, `Commands`, `World`, `EventReader<E>`, `EventWriter<E>`, `Local<T>`, `SystemSet`
- **Runtime** — `App`, the `World` wrapper, `Commands`, scheduler, observer/monitor dispatch, event buffers, resource store, change-detection stores, trait registry
- **The `rovy` registry object** — `rovy.loadPaths(...)` (public; authored TS passes string paths that the transformer lowers to Instance roots) plus the `rovy.__component` / `__collect` / `__prefab` / `__resource` / `__event` / `__system` / `__observer` / `__monitor` / `__relation` / `__schedule` / `__traitImpl` / `__query` / `rovy.traitToken` entry points (transformer-only — never hand-called; `__prefab` is planned)

```ts
import { App, component, system, Query, Res, rovy } from "@rovy/core";
```

The runtime is *packaged inside* `@rovy/core`. There is no separate runtime package — the transformer targets the API surface that core already exports.

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

## What lives in `@rovy/ui`

`@rovy/ui` is the TypeScript-authored widget/render integration package.

- **Runtime model** — Rovy-owned immediate UI runtime inspired by EgooE/Plasma, with no `@rbxts/egooe` dependency
- **Built-in catalog** — `window`, `button`, `checkbox`, `slider`, `input`, `label`, `table`, `popup`, `demoWindow`, and related layout/control helpers
- **Public authoring primitive** — built-in widget functions plus custom JSDoc-tagged widget functions
- **Authoring style** — plain calls such as `Window({ title: "Inventory" })`
- **Not the public model** — widget classes, `new Window()`, `RovyUi.Window(...)`
- **State model** — function-first widgets with compile-keyed helpers like `useState`, `useEffect`, and `useInstance`
- **Transformer contract** — widget functions are wrapped through `RovyUi.__widget(...)`, widget calls lower through `RovyUi.__callWidget(...)`, and storage helpers lower to keyed internals for stable identity

This package is meant to feel closer to EgooE's function-driven rendering style than to a React component tree, while still using Rovy's registration, identity, and injection machinery. Runtime does not use `debug.info(...)` for identity; transformer keys own that job.

## What `rovy-transformer` does

A roblox-ts custom transformer. Pure build-time. It never ships to the game. Duties (full list in [Transformer](10-transformer.md)):

1. Scan decorated classes.
2. Resolve `trait<T>()` / `query<...>()` / `Trait<T>` via `TypeChecker`.
3. Hoist `Query<...>` / `query<...>()` to module-level descriptors.
4. Inject a `rovy.__*` registration call after each decorated class.
5. Rewrite `trait<T>()` → `rovy.traitToken("stable/path")`.
6. Validate decorator usage (observer field exclusivity, monitor param order, `@resource` defaulted ctor, planned `@prefab` zero-arg ctor + `build(...)` shape).
7. UI support: detect JSDoc `@widget` functions, inject widget registration, wrap them through `RovyUi.__widget(...)`, lower plain/custom and built-in widget calls through `RovyUi.__callWidget(...)`, lower storage helpers to keyed internals, and lower style sugar.

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

For UI work, the equivalent boundary is the `RovyUi.__widget(...)` wrapping contract plus the lowered plain-call widget authoring described in [UI](26-ui.md).

## Setup

Install the core runtime and transformer:

```sh
npm i @rovy/core
npm i -D rovy-transformer
```

Install networking only when using net events:

```sh
npm i @rovy/networking
```

Install UI only when using widget authoring:

```sh
npm i @rovy/ui
```

Register the transformer in `tsconfig.json` (roblox-ts reads `compilerOptions.plugins`) and point it at the shared Rovy config:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "transform": "rovy-transformer",
        "config": ".rovy.json"
      }
    ]
  }
}
```

Then keep environment, Rojo, boundary, and Blink settings in `.rovy.json`:

```json
{
  "current": "dev",
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
```

That is the only transformer touchpoint in `tsconfig.json`. `rbxtsc` picks it up automatically; no extra build step. When networking is enabled, the backend generates Blink files into `out/shared/net/generated/*`, so users only author decorators and injected params.

## Macro / decorator stubs (transformer-not-run guard)

Decorators and macros are real exports in `@rovy/core`, but their *meaningful* behavior is the transformer-injected code. If the transformer did not run, the stubs fail loudly rather than silently misbehaving — same pattern as Flamework's "Macro was not transformed" error.

```ts
// @rovy/core (conceptual)
export function trait<T>(): TraitToken {
    throw "[rovy] trait<T>() reached runtime untransformed — is rovy-transformer in tsconfig plugins?";
}

export function query<T extends unknown[], F extends unknown[] = []>(): QueryToken {
    throw "[rovy] query<...>() reached runtime untransformed — is rovy-transformer in tsconfig plugins?";
}

// decorators are no-ops on their own; the injected rovy.__* call does the work
export function component(ctor: object) { /* marker only */ }
```

So a missing/misconfigured transformer surfaces as an immediate, explicit error at first macro hit — not as silently-unregistered systems.

## Why split

- **Runtime stays importable & typed.** Game code depends only on `@rovy/core`; no build magic needed to read the API.
- **Transformer is a dev dependency.** It is never bundled into the place file.
- **One contract.** The `rovy.__*` surface is the single boundary; either side can be reimplemented as long as it honors it.
- **Mirrors Flamework.** Familiar to roblox-ts devs: code against core, list the transformer in tsconfig, done.

## See also

- [Overview](01-overview.md)
- [Transformer](10-transformer.md) — full build-time duty list
- [Compiled output](19-compiled-output.md) — what the transformer emits
- [Runtime lifecycle](20-runtime-lifecycle.md) — how the runtime consumes it
- [API reference](12-api-reference.md)
- [Prefabs](24-prefabs.md)
- [UI](26-ui.md)
