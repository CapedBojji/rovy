# Packages — core, networking, ui, and transformer

Rovy ships as distinct packages, mirroring the split between runtime packages and build-time transformer tooling:

| Package | Role | You interact with it by |
|---------|------|-------------------------|
| `@rovy/core` | Decorators, macros, types, **and the packaged runtime** | `import` it and write code |
| `@rovy/networking` | Net-event authoring surface and runtime handles | `import` it when using `@netEvent` |
| `@rovy/ui` | Planned stateless widget authoring surface and UI runtime | `import` it when using widget callers/builders |
| `rovy-transformer` | roblox-ts compiler transformer plugin | Listing it in `tsconfig.json` and pointing it at `.rovy.json` |

Most ECS code authors against `@rovy/core`. Networked event code additionally imports `@rovy/networking`. Planned widget authoring additionally imports `@rovy/ui`. `rovy-transformer` runs silently at build time and rewrites decorated code into the registration calls the runtimes consume.

Inside this repo, those packages live in a pnpm workspace at `packages/core`, `packages/networking`, a planned `packages/ui`, and `packages/transformer`.

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

UI is planned as a separate package rather than part of `@rovy/core`.

Planned contents:

- **Widget runtime helper** — future `useWidget(...)`-style plumbing
- **Runtime authoring surface** — widget registry + widget invocation plumbing
- **Transformer-aware widget call surface** — plain calls to JSDoc-tagged widget caller functions such as `Window(args)`
- **Stateless widget contract** — no `useState`, no `useEffect`, no hook runtime as part of the public design

```ts
/** @widget WindowBuilder */
export function Window(options: { title: string }): void {}

@widget
class WindowBuilder {
	build() {
		return (options: { title: string }) => {};
	}
}
```

The current planned model is:

- widgets use a JSDoc-tagged caller function plus a same-file `@widget` builder class
- `rovy.loadPaths(...)` requiring modules auto-collects them through injected registration side effects
- the caller JSDoc explicitly names the builder
- the builder must be resolved in the same file only
- the builder owns `build(...)`
- transformer/runtime pass that build result through the future `useWidget(...)` path
- authored widget calls stay plain function calls

The intended authored syntax is plain-call sugar:

```ts
Window({ title: "Inventory" });
```

Also not the primary surface:

```ts
RovyUi.Window({ title: "Inventory" });
```

Because the user-facing call target is a normal function and the JSDoc names a same-file builder explicitly, editor/typechecker behavior should stay normal while still giving the transformer something reliable to discover.

## What `rovy-transformer` does

A roblox-ts custom transformer. Pure build-time. It never ships to the game. Duties (full list in [Transformer](10-transformer.md)):

1. Scan decorated classes.
2. Resolve `trait<T>()` / `query<...>()` / `Trait<T>` via `TypeChecker`.
3. Hoist `Query<...>` / `query<...>()` to module-level descriptors.
4. Inject a `rovy.__*` registration call after each decorated class.
5. Rewrite `trait<T>()` → `rovy.traitToken("stable/path")`.
6. Validate decorator usage (observer field exclusivity, monitor param order, `@resource` defaulted ctor, planned `@prefab` zero-arg ctor + `build(...)` shape, planned same-file JSDoc `@widget` caller/builder lowering shape).

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

Install UI only when using widgets:

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
