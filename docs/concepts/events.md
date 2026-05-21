# Events

> **Compile-time.** `@event` decorator marks a class as an event and attaches metadata. The transformer injects a `rovy.__event` side-effect call after the class. Only `@event`-decorated classes can be used with `commands.send`, `commands.trigger`, `world.trigger`, and `EventReader<E>`.

Events are messages. Two paths:

```txt
send    = buffered event for event-reader systems
trigger = observer event
```

## Defining events

Decorate with `@event`. Decorator options carry metadata.

```ts
@event()
class DamageTaken {
	constructor(
		public target: Entity,
		public amount: number,
		public source?: Entity,
		public damageType: "Physical" | "Fire" | "Ice" | "Poison" = "Physical",
	) {}
}
```

## Decorator options

```ts
interface EventOptions {
	capacity?: number;         // max buffered events before oldest are dropped (default: unlimited)
	label?: string;            // debug label (default: class name)
}
```

```ts
@event({ capacity: 256 })
class DamageTaken { ... }

@event({ label: "UnitDied" })
class UnitDied {
	constructor(
		public unit: Entity,
		public killer?: Entity,
	) {}
}
```

`capacity` is useful for preventing runaway observer chains from producing unbounded event buffers.

## Buffered (`send`)

Producer — from a system via commands:

```ts
commands.send(new DamageTaken(target, 10, source));
```

Reader — declare `EventReader<E>` as a system param:

```ts
@system({ schedule: Update, set: DamageSet })
class ProcessDamage {
	run(
		commands: Commands,
		events: EventReader<DamageTaken>,
	) {
		events.forEach((event) => {
			const health = world.get(event.target, Health);
			if (!health) return;

			commands.set(event.target, Health, new Health(
				health.current - event.amount,
				health.max,
			));
		});
	}
}
```

`EventReader<E>` only accepts `@event`-decorated classes for `E`.

## Writing events from systems

`EventWriter<E>` as a system param gives a typed `send` handle:

```ts
@system({ schedule: Update, set: StatusSet })
class TickPoison {
	run(
		q: Query<[Entity, Poisoned]>,
		clock: Res<BattleClock>,
		damage: EventWriter<DamageTaken>,
	) {
		q.forEach((entity, poisoned) => {
			damage.send(new DamageTaken(entity, poisoned.damagePerTick, poisoned.source, "Poison"));
		});
	}
}
```

## Triggered

Deferred trigger (preferred from systems):

```ts
commands.trigger(new DamageTaken(target, 10, source));
```

Immediate trigger (runs observers synchronously, only when you really need it):

```ts
world.trigger(new DamageTaken(target, 10, source));
```

## Rule

```txt
commands.trigger(...) = deferred observer reaction
world.trigger(...)    = immediate observer reaction
commands.send(...)    = buffered event for systems (via EventReader)
```

## When to pick which

| Need | Use |
|------|-----|
| Multiple systems should react in scheduled order | `send` / `EventReader` |
| Cause-effect chain (damage → death → loot) | `trigger` |
| Inside an observer, react before next system runs | `world.trigger` |

External Roblox or Flamework signals are a different problem. `EventReader<E>` is for **Rovy-native** `@event` classes that are already inside the ECS world. For external-signal translation, see [Collectors](/concepts/collectors.md).

Cross-network delivery is also a separate layer. `@event` is local-only by default; the draft `@netEvent` design adds transport metadata and re-enters the event on the receiver with `commands.send(...)` or `commands.trigger(...)`. See [Networking](/packages/networking.md).

## Registration

Transformer injects a side-effect call after each `@event` class:

```ts
class DamageTaken { ... }
rovy.__event(DamageTaken, { capacity: 256 });

class UnitDied { ... }
rovy.__event(UnitDied, { capacity: undefined });
```

`rovy.loadPaths(...)` makes these run; `app.start()` builds the buffers. See [Compiled output](/runtime/compiled-output.md).

Undecorated class passed to `commands.send` or `EventReader<E>` → transformer error.

## See also

- [Observers](/concepts/observers.md)
- [Systems and injection](/concepts/systems-and-injection.md)
- [Commands](/concepts/commands.md)
- [Collectors](/concepts/collectors.md)
- [Networking](/packages/networking.md)
