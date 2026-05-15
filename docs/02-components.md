# Components, Resources

> **Compile-time.** `@component` and `@resource` decorators cause the transformer to inject a `rovy.__component` / `rovy.__resource` side-effect call after the class. `rovy.loadPaths(...)` runs them; `app.start()` finalizes. No central manifest.

## Components

Components are classes decorated with `@component`. Constructor parameters become fields.

```ts
@component
class Position {
	constructor(
		public cell: Vector2,
		public facingAngle: number,
	) {}
}

@component
class Health {
	constructor(
		public current: number,
		public max: number,
	) {}
}
```

## Tags

Tags are empty `@component` classes. No fields, no instance state.

```ts
@component
class Unit {}

@component
class Dead {}
```

## Spawning

Spawn through `commands` (deferred, the normal path):

```ts
commands.spawn(
	Unit,
	new Position(new Vector2(2, 3), 0),
	new Health(100, 100),
);
```

Rules:

- Tag → pass constructor (`Unit`).
- Component with data → pass instance (`new Position(...)`).

Direct `world.spawn(...)` is an escape hatch — startup, tests, or when you need the entity id back immediately. See [Commands](04-commands.md#direct-world-access).

## Resources

Resources are singleton world-level objects. One instance per class. Not attached to any entity. Decorate with `@resource`.

**All constructor parameters must have defaults.** The transformer auto-registers resources by calling `new ResourceClass()` at boot — no manual `app.insertResource()` needed.

```ts
@resource
class BattleClock {
	constructor(
		public tick = 0,
		public delta = 1 / 30,
	) {}
}

@resource
class GameConfig {
	constructor(
		public maxPlayers = 8,
		public roundDuration = 120,
	) {}
}
```

No boot registration needed — `@resource` decorator + defaults = auto-registered.

Access via injection in systems/observers/monitors:

```ts
@system({ schedule: Update, set: ClockSet })
class IncrementClock {
	run(clock: ResMut<BattleClock>) {
		clock.tick += 1;
	}
}
```

| Param | Meaning |
|-------|---------|
| `Res<T>` | read-only resource, throws if missing |
| `ResMut<T>` | mutable resource, signals write intent |
| `OptRes<T>` | `T \| undefined` |

Override defaults at boot (optional):

```ts
app.insertResource(new BattleClock(100, 1 / 60));
```

If `app.insertResource()` is called, it replaces the auto-registered default. Use for tests, custom configs, or non-default initial values.

Escape hatch — direct access:

```ts
const clock = world.resource(BattleClock);
clock.tick += 1;
```

Use resources for global state: clocks, RNG, config, scoreboards.

## Registration

Transformer injects a side-effect call after each decorated class. No central manifest.

```ts
class Position { ... }
rovy.__component(Position, "src/components/Position");

class BattleClock { ... }
rovy.__resource(BattleClock, "src/resources/BattleClock");
```

`rovy.loadPaths(...)` force-requires these modules so the calls run; `app.start()` finalizes. See [Compiled output](19-compiled-output.md).

Undecorated class used as a component term or in `commands.spawn` → transformer error.

## See also

- [Queries](03-queries.md)
- [Commands](04-commands.md)
- [Systems and injection](17-systems-and-injection.md)
