# Rovy

> Bevy-like ECS for [roblox-ts](https://roblox-ts.com/), built on [jecs](https://github.com/Ukendio/jecs).

Rovy is a high-level Entity-Component-System authoring layer for roblox-ts. jecs handles
the low-level mechanics — entity ids, component storage, raw queries, relationships, and
lifecycle hooks. Rovy adds the ergonomic layer on top: decorator-based authoring, trait
metadata, event observers, lifecycle monitors, commands, and a custom scheduler — a
developer experience closer to [Bevy](https://bevyengine.org/).

**Documentation: https://capedbojji.github.io/rovy/**

## Example

```ts
import { App, component, system, Query } from "@rovy/core";

@component
class Position {
  constructor(public x: number, public y: number) {}
}

@component
class Velocity {
  constructor(public dx: number, public dy: number) {}
}

@system({ schedule: Update })
class MoveEntities {
  run(q: Query<[Position, Velocity]>) {
    q.forEach((pos, vel) => {
      pos.x += vel.dx;
      pos.y += vel.dy;
    });
  }
}

new App().start();
```

## Features

- **Decorator-based authoring** — `@component`, `@resource`, `@event`, `@system`,
  `@observer`, `@monitor`, `@relation`, `@schedule`, `@plugin`. The transformer wires
  registration for you.
- **Compile-time queries & injection** — `Query<...>` terms and system parameters are
  resolved and hoisted at build time; zero runtime reflection.
- **Interface-based traits** — `trait<T>()` turns plain interfaces into queryable,
  transformer-derived metadata.
- **Events, observers & monitors** — buffered events, event-only observers, and
  query-level lifecycle monitors (`onEnter` / `onExit` / `onChange`).
- **Commands & schedules** — deferred mutations, custom schedules, system sets, and
  explicit flush points.
- **Optional packages** — `@rovy/networking` (`@netEvent` over Blink),
  `@rovy/ui` (function-first immediate-mode widgets), and
  `@rovy/world-inspector` (live local/remote ECS inspection).

## Packages

| Package | Role |
|---------|------|
| `@rovy/core` | Decorators, macros, types, and the packaged runtime — what you import |
| `@rovy/networking` | `@netEvent` authoring surface and runtime handles |
| `@rovy/ui` | Function-first widget/render runtime |
| `@rovy/world-inspector` | In-game ECS inspection and editing plugin |
| `rovy-transformer` | roblox-ts compiler transformer plugin (dev dependency) |

## Install

```sh
npm i @rovy/core
npm i -D rovy-transformer
```

Register the transformer in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [{ "transform": "rovy-transformer", "config": ".rovy.json" }]
  }
}
```

Full setup: [Installation guide](https://capedbojji.github.io/rovy/guide/installation).

## Repository layout

```
packages/      core, networking, ui, transformer
docs/          VitePress documentation site
```

## Development

```sh
pnpm install
pnpm build           # build all packages
pnpm test            # run all package tests
pnpm docs:dev        # run the docs site locally
```

Requires Node.js >=22.13 and pnpm 11.

## License

MIT
