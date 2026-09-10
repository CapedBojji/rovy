# `@rovy/core`

Bevy-like ECS authoring layer for [roblox-ts](https://roblox-ts.com/), built on
[jecs](https://github.com/Ukendio/jecs).

jecs owns the low-level mechanics — entity ids, component storage, raw queries,
relationships, and lifecycle hooks. `@rovy/core` adds the ergonomic layer on
top: decorator-based authoring, trait metadata, event observers, lifecycle
monitors, commands, and a custom scheduler.

The runtime is packaged **inside** this package. There is no separate runtime
package.

## Install

```sh
npm i @rovy/core @rovy/jecs
npm i -D rovy-transformer rovy-build
```

`@rovy/jecs` is a peer dependency — the Rovy-vendored jecs runtime that
`@rovy/core` compiles against. Install it alongside core.

Register the transformer in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [{ "transform": "rovy-transformer" }]
  }
}
```

## Example

```ts
import { RunService } from "@rbxts/services";
import { App, component, schedule, system, Query } from "@rovy/core";

@component
class Position {
  constructor(public x: number, public y: number) {}
}

@component
class Velocity {
  constructor(public dx: number, public dy: number) {}
}

// Rovy ships no built-in schedules — you declare your own.
@schedule
class Update {}

@system({ schedule: Update })
class MoveEntities {
  run(q: Query<[Position, Velocity]>) {
    q.forEach((pos, vel) => {
      pos.x += vel.dx;
      pos.y += vel.dy;
    });
  }
}

const app = new App();
app.start();

RunService.Heartbeat.Connect((dt) => app.runSchedule(Update, dt));
```

## What it exports

- **Decorators** — `@component`, `@collect`, `@resource`, `@event`, `@system`,
  `@observer`, `@monitor`, `@relation`, `@schedule`, `@set`, `@plugin`,
  `@server`, `@client`, `@inspect`
- **Macros** — `trait<T>()`, `query<...>()`
- **Type helpers** — `Query<...>`, `Res<T>`, `ResMut<T>`, `OptRes<T>`,
  `Trait<T>`, `Pair<R>`, `Optional<C>`, `With<C>`, `Without<C>`, `Changed<C>`,
  `Added<C>`, `Removed<C>`, `Entity`, `Commands`, `World`, `EventReader<E>`,
  `EventWriter<E>`, `Local<T>`, `SystemSet`
- **Runtime** — `App`, `RovyWorld`, `Commands`, `Scheduler`, observer/monitor
  dispatch, lifecycle hooks, event buffers, resource store, change-detection
  stores, trait registry
- **Flush contract** — `FlushParticipant` / `FlushContext`, used by companion
  packages to commit external work at every Rovy set boundary

> [!IMPORTANT]
> Decorators and macros are real exports, but their meaningful behavior is
> transformer-injected. Without `rovy-transformer` registered, the stubs throw
> loudly at the first macro hit.

## Documentation

<https://capedbojji.github.io/rovy/>

## License

MIT
