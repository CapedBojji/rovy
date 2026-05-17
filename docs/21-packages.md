# Packages — `@rovy/core` and `rovy-transformer`

Rovy ships as two packages, mirroring the Flamework split (`@flamework/core` + `rbxts-transformer-flamework`):

| Package | Role | You interact with it by |
|---------|------|-------------------------|
| `@rovy/core` | Decorators, macros, types, **and the packaged runtime** | `import` it and write code |
| `rovy-transformer` | roblox-ts compiler transformer plugin | Listing it in `tsconfig.json` once |

You only ever author against `@rovy/core`. `rovy-transformer` runs silently at build time and rewrites your decorated code into the `rovy.__*` registration calls the bundled runtime consumes.

Inside this repo, those packages live in a pnpm workspace at `packages/core` and `packages/transformer`. That split is implementation-only; the published package boundary stays the same.

## What lives in `@rovy/core`

Everything you import:

- **Decorators** — `@component`, `@collect`, `@resource`, `@event`, `@system`, `@observer`, `@monitor`, `@relation`, `@schedule`, `@set`, `@plugin`
- **Macros** — `trait<T>()`, `query<...>()`
- **Type-only helpers** — `Query<...>`, `Res<T>`, `ResMut<T>`, `OptRes<T>`, `Trait<T>`, `HasTrait<T>`, `AllTraits<T>`, `Pair<R>`, `Optional<C>`, `With<C>`, `Without<C>`, `Changed<C>`, `Added<C>`, `Removed<C>`, `Entity`, `Commands`, `World`, `EventReader<E>`, `EventWriter<E>`, `Local<T>`, `SystemSet`
- **Runtime** — `App`, the `World` wrapper, `Commands`, scheduler, observer/monitor dispatch, event buffers, resource store, change-detection stores, trait registry
- **The `rovy` registry object** — `rovy.loadPaths(...)` (public; authored TS passes string paths that the transformer lowers to Instance roots) plus the `rovy.__component` / `__collect` / `__resource` / `__event` / `__system` / `__observer` / `__monitor` / `__relation` / `__schedule` / `__traitImpl` / `__query` / `rovy.traitToken` entry points (transformer-only — never hand-called)

```ts
import { App, component, system, Query, Res, rovy } from "@rovy/core";
```

The runtime is *packaged inside* `@rovy/core`. There is no separate runtime package — the transformer targets the API surface that core already exports.

## What `rovy-transformer` does

A roblox-ts custom transformer. Pure build-time. It never ships to the game. Duties (full list in [Transformer](10-transformer.md)):

1. Scan decorated classes.
2. Resolve `trait<T>()` / `query<...>()` / `Trait<T>` via `TypeChecker`.
3. Hoist `Query<...>` / `query<...>()` to module-level descriptors.
4. Inject a `rovy.__*` registration call after each decorated class.
5. Rewrite `trait<T>()` → `rovy.traitToken("stable/path")`.
6. Validate decorator usage (observer field exclusivity, monitor param order, `@resource` defaulted ctor).

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

Install both:

```sh
npm i @rovy/core
npm i -D rovy-transformer
```

Register the transformer in `tsconfig.json` (roblox-ts reads `compilerOptions.plugins`):

```json
{
  "compilerOptions": {
    "plugins": [
      { "transform": "rovy-transformer" }
    ]
  }
}
```

That is the only transformer touchpoint. `rbxtsc` picks it up automatically; no extra build step.

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
