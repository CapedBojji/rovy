# Your First System

A hands-on walkthrough: define components, write a system, spawn entities, and boot an
`App`. This assumes you have completed [Installation](/guide/installation).

## 1. Define components

Components are plain classes decorated with `@component`. Constructor parameters become
the component's data.

```ts
import { component } from "@rovy/core";

@component
class Position {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

@component
class Velocity {
  constructor(
    public dx: number,
    public dy: number,
  ) {}
}
```

A component with no data is a **tag** — useful as a query filter:

```ts
@component
class Player {}
```

The transformer injects a `rovy.__component(...)` registration after each class. You
never call it yourself.

## 2. Add a resource

Resources are world-global singletons. A `@resource` class must have an all-defaulted
constructor — it is auto-registered at boot, no `app.insertResource()` needed.

```ts
import { resource } from "@rovy/core";

@resource
class GameClock {
  constructor(
    public tick = 0,
    public delta = 1 / 60,
  ) {}
}
```

## 3. Write a system

Systems are classes decorated with `@system`. The decorator carries scheduling config;
the `run` method's parameter types declare what the system needs. The transformer reads
those types and injects exactly the right handles.

```ts
import { system, Query, Res } from "@rovy/core";

@system({ schedule: Update })
class MoveEntities {
  run(q: Query<[Position, Velocity]>, clock: Res<GameClock>) {
    q.forEach((pos, vel) => {
      pos.x += vel.dx * clock.delta;
      pos.y += vel.dy * clock.delta;
    });
  }
}
```

`Query<[Position, Velocity]>` matches every entity that has **both** components and
binds their instances. `Res<GameClock>` injects the resource. See
[Systems & Injection](/concepts/systems-and-injection) for the full param table.

## 4. Spawn entities at startup

Use the `Startup` schedule and `Commands` to create entities once at boot.

```ts
import { system, Commands } from "@rovy/core";

@system({ schedule: Startup })
class SpawnEntities {
  run(commands: Commands) {
    commands.spawn(new Position(0, 0), new Velocity(1, 2), Player);
    commands.spawn(new Position(10, 5), new Velocity(-1, 0));
  }
}
```

`Commands` mutations are **deferred** — applied at the next flush point, not
immediately. See [Commands](/concepts/commands).

## 5. Boot the App

`rovy.loadPaths(...)` requires your modules so the injected registration calls run.
`app.start()` instantiates systems, sorts them, and begins the schedule loop.

```ts
import { App, rovy } from "@rovy/core";

const app = new App();
rovy.loadPaths("src/shared/components", "src/shared/systems");
app.start();
```

::: tip
`loadPaths` takes string paths in TypeScript authoring; the transformer maps them to
Roblox Instance roots at build time.
:::

## 6. Filter with `With` / `Without`

Refine a query without binding the extra component:

```ts
@system({ schedule: Update })
class MovePlayersOnly {
  run(q: Query<[Position, Velocity], With<Player>>) {
    q.forEach((pos, vel) => {
      // only entities tagged Player
    });
  }
}
```

## Where to go next

- [Queries](/concepts/queries) — terms, filters, change detection.
- [Events](/concepts/events) and [Observers](/concepts/observers) — reactive logic.
- [Schedules](/concepts/schedules) — ordering systems with sets and flush points.
