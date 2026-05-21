# Observers

> **Compile-time.** `@observer` is processed by the transformer. Observers react to explicitly triggered or sent events — not to component lifecycle changes. For lifecycle reactions (enter, exit, change), use [Monitors](/concepts/monitors.md).

Observers react to events dispatched via `commands.trigger()`, `world.trigger()`, or `commands.send()`.

Observers are for **Rovy events**, not as the primary bridge for Roblox or Flamework callbacks. If the source is `connect(...)`, `Activated`, `CharacterAdded`, `InputBegan`, or another external signal, use a collector feeding a normal system; see [Collectors](/concepts/collectors.md).

## Decorator options

```ts
interface ObserverOptions {
	event: EventCtor;       // @event-decorated class — required
	priority?: number;      // higher runs first, default: 0
}
```

## Event observers

```ts
@observer({ event: DamageTaken, priority: 100 })
class ReduceArmor {
	run(event: DamageTaken, world: World, commands: Commands) {
		const armor = world.get(event.target, Armor);
		if (!armor) return;
		// reduce incoming damage by armor value
	}
}

@observer({ event: DamageTaken, priority: 0 })
class ApplyDamage {
	run(
		event: DamageTaken,
		commands: Commands,
		world: World,
	) {
		const health = world.get(event.target, Health);
		if (!health) return;
		const next = math.max(0, health.current - event.amount);
		commands.set(event.target, Health, new Health(next, health.max));
		if (next <= 0) {
			commands.trigger(new UnitDied(event.target, event.source));
		}
	}
}

@observer({ event: DamageTaken, priority: -100 })
class ShowFloatingText {
	run(event: DamageTaken) {
		// UI side effect, runs last
	}
}
```

`priority` — higher runs first. All matching observers run; events are not consumed.

## Param injection

Same injection as systems — multiple queries, resources, etc.

| Param type | Injected value |
|------------|----------------|
| Event class (first param) | the event instance |
| `Commands` | command buffer |
| `Query<Terms, ...Filters>` | pre-built query handle |
| `Res<T>` | world resource |
| `World` | raw world access |

```ts
@observer({ event: CastCompleted })
class SlimeBash {
	run(
		event: CastCompleted,
		commands: Commands,
		targets: Query<[Entity, Health], Without<Dead>>,
	) {
		if (event.abilityId !== "SlimeBash") return;
		if (!event.target) return;
		commands.trigger(new DamageTaken(event.target, 15, event.caster, "Physical"));
	}
}
```

## Stacking

Multiple `@observer` decorators on one class — registered once per decorator:

```ts
@observer({ event: DamageTaken })
@observer({ event: HealReceived })
class UpdateHealthBar {
	run(event: DamageTaken | HealReceived, commands: Commands) { ... }
}
```

## See also

- [Events](/concepts/events.md)
- [Monitors](/concepts/monitors.md) — lifecycle reactions (enter/exit/change)
- [Schedules](/concepts/schedules.md)
- [Systems and injection](/concepts/systems-and-injection.md)
- [Collectors](/concepts/collectors.md)
