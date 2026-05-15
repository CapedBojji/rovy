# Observers

> **Compile-time.** `@observer` is processed by the transformer. It extracts the decorator options and `run` param types, registers the observer in the manifest, and wires up jecs hooks or trigger dispatch. Observers follow the same param injection model as systems — `Query<...>`, `Res<T>`, `Commands`, etc. all injected.

Observers react to component lifecycle changes or triggered events. One decorator handles both.

## Decorator options

```ts
interface ObserverOptions {
	// lifecycle — pick: on+watch OR on+trait
	on?: "add" | "insert" | "change" | "remove";
	watch?: ComponentCtor | ComponentCtor[];  // single or array
	trait?: InterfaceType;                    // transformer resolves via TypeChecker

	// for arrays — how many components must match
	match?: "any" | "all";  // default: "any"

	// event observer
	event?: EventCtor;      // @event-decorated class

	// ordering
	priority?: number;      // higher runs first, default: 0
}
```

## Component lifecycle observers

Single component:

```ts
@observer({ on: "add", watch: Stunned })
class OnStunApplied {
	run(
		entity: Entity,
		value: Stunned,
		commands: Commands,
	) {
		commands.remove(entity, CurrentCast);
		commands.remove(entity, Moving);
	}
}
```

Change — receives previous and next value:

```ts
@observer({ on: "change", watch: Health })
class OnHealthChanged {
	run(entity: Entity, prev: Health, next: Health, commands: Commands) {
		if (next.current <= 0 && prev.current > 0) {
			commands.trigger(new UnitDied(entity));
		}
	}
}
```

Remove:

```ts
@observer({ on: "remove", watch: Stunned })
class OnStunRemoved {
	run(entity: Entity, commands: Commands) {
		print("stun removed from", entity);
	}
}
```

## Multiple queries in an observer

Observers take the same injected params as systems. Multiple `Query<...>` params fine.

```ts
@observer({ on: "add", watch: Poisoned })
class OnPoisonApplied {
	run(
		entity: Entity,
		value: Poisoned,
		commands: Commands,
		resistors: Query<[Entity, PoisonResist]>,
		clock: Res<BattleClock>,
	) {
		// check if entity has a resistor by cross-referencing another query
		resistors.forEach((other, resist) => {
			if (other === entity) {
				const reduced = value.damagePerTick * (1 - resist.amount);
				commands.insert(entity, new Poisoned(reduced, value.expiresAtTick, value.source));
			}
		});
	}
}
```

## Multi-component watch

Array — any (OR, default): fires if any listed component is added.

```ts
@observer({ on: "add", watch: [Mine, Explosive] })
class OnExplosiveAdded {
	run(entity: Entity, commands: Commands) { ... }
}
```

Array — all (AND, gated): fires when one is added and entity now has all.

```ts
@observer({ on: "add", watch: [Mine, Explosive], match: "all" })
class OnArmedMine {
	run(entity: Entity, commands: Commands) {
		commands.insert(entity, Armed);
	}
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

`priority` — higher runs first. Observers of same event run in priority order. Observers do not consume events — all matching observers run.

## Event observers with queries

```ts
@observer({ event: UnitDied })
class DropLoot {
	run(
		event: UnitDied,
		commands: Commands,
		lootTables: Query<[Entity, LootTable], With<Enemy>>,
	) {
		lootTables.forEach((enemy, table) => {
			if (enemy === event.unit) {
				table.rolls.forEach((roll) => commands.spawn(new LootDrop(roll)));
			}
		});
	}
}
```

## Trait observers

`trait` replaces `watch` for interface-based targeting. Transformer expands to one concrete observer per registered implementer.

```ts
@observer({ on: "add", trait: CrowdControl })
class OnCrowdControlApplied {
	run(entity: Entity, value: CrowdControl, commands: Commands) {
		if (value.blocksCasting()) commands.remove(entity, CurrentCast);
		if (value.blocksMovement()) commands.remove(entity, Moving);
	}
}
```

Expands to:

```ts
@observer({ on: "add", watch: Stunned })
@observer({ on: "add", watch: Rooted })
@observer({ on: "add", watch: Frozen })
// ... one per CrowdControl implementer
```

All at compile time. See [Trait observers](10-trait-observers.md).

## Param injection

Same params available as systems:

| Param type | Injected value |
|------------|----------------|
| `Entity` | entity that triggered (lifecycle observers only) |
| `Commands` | command buffer |
| `Query<Terms, ...Filters>` | pre-built query handle |
| `Res<T>` | world resource |
| `World` | raw world access |
| `EventReader<E>` | buffered events |

Multiple queries:

```ts
@observer({ event: CastCompleted })
class SlimeBash {
	run(
		event: CastCompleted,
		commands: Commands,
		cooldowns: Query<[Entity, Cooldowns]>,
		targets: Query<[Entity, Health], Without<Dead>>,
	) {
		if (event.abilityId !== "SlimeBash") return;
		if (!event.target) return;
		commands.trigger(new DamageTaken(event.target, 15, event.caster, "Physical"));
	}
}
```

## See also

- [Events](05-events.md)
- [Trait observers](10-trait-observers.md)
- [Flush semantics](07-schedules.md)
- [Systems and injection](19-systems-and-injection.md)
