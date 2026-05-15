# Examples — Combat System

Worked examples using a combat system. The decorator/injection patterns apply to any domain.

## Components

```ts
@component
class Unit {}

@component
class Dead {}

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

@component
class CurrentCast {
	constructor(
		public abilityId: string,
		public target: Entity | undefined,
		public startedAtTick: number,
		public endsAtTick: number,
		public phase: "Prepare" | "Active" | "Recovery",
	) {}
}

@component
class Cooldowns {
	constructor(
		public byAbilityId: Map<string, number>,
	) {}
}

@component
class Poisoned {
	constructor(
		public damagePerTick: number,
		public expiresAtTick: number,
		public source?: Entity,
	) {}
}
```

## Resource

Defaults required — auto-registered at boot, no `app.insertResource()` needed.

```ts
@resource
class BattleClock {
	constructor(
		public tick = 0,
		public delta = 1 / 30,
	) {}
}
```

## Events

```ts
@event()
class TryCastAbility {
	constructor(
		public caster: Entity,
		public abilityId: string,
		public target?: Entity,
	) {}
}

@event()
class CastCompleted {
	constructor(
		public caster: Entity,
		public abilityId: string,
		public target?: Entity,
	) {}
}

@event({ capacity: 256 })
class DamageTaken {
	constructor(
		public target: Entity,
		public amount: number,
		public source?: Entity,
		public damageType: "Physical" | "Fire" | "Ice" | "Poison" = "Physical",
	) {}
}

@event()
class UnitDied {
	constructor(
		public unit: Entity,
		public killer?: Entity,
	) {}
}
```

## Ability flow

Trigger a cast from anywhere:

```ts
commands.trigger(new TryCastAbility(slime, "SlimeBash", knight));
```

Observer validates and starts the cast:

```ts
@observer({ event: TryCastAbility })
class StartCast {
	run(
		event: TryCastAbility,
		commands: Commands,
		world: World,
		clock: Res<BattleClock>,
	) {
		const cooldowns = world.get(event.caster, Cooldowns);
		const readyAt = cooldowns?.byAbilityId.get(event.abilityId);
		if (readyAt !== undefined && clock.tick < readyAt) return;

		commands.insert(
			event.caster,
			new CurrentCast(
				event.abilityId,
				event.target,
				clock.tick,
				clock.tick + 30,
				"Prepare",
			),
		);
	}
}
```

System completes casts at their end tick:

```ts
@system({ schedule: Update, set: CastingSet })
class CompleteCasts {
	run(
		commands: Commands,
		q: Query<[Entity, CurrentCast]>,
		clock: Res<BattleClock>,
	) {
		q.forEach((caster, cast) => {
			if (clock.tick < cast.endsAtTick) return;

			commands.remove(caster, CurrentCast);
			commands.trigger(new CastCompleted(caster, cast.abilityId, cast.target));
		});
	}
}
```

Ability-specific observer reacts to completion:

```ts
@observer({ event: CastCompleted })
class SlimeBash {
	run(event: CastCompleted, commands: Commands) {
		if (event.abilityId !== "SlimeBash") return;
		if (!event.target) return;

		commands.trigger(new DamageTaken(event.target, 15, event.caster, "Physical"));
	}
}
```

Damage applied, ordered by priority:

```ts
@observer({ event: DamageTaken, priority: 0 })
class ApplyDamage {
	run(event: DamageTaken, commands: Commands, world: World) {
		const health = world.get(event.target, Health);
		if (!health) return;

		const next = math.max(0, health.current - event.amount);
		commands.set(event.target, Health, new Health(next, health.max));

		if (next <= 0) {
			commands.trigger(new UnitDied(event.target, event.source));
		}
	}
}
```

## Lifecycle via monitor

React when a unit dies (gains `Dead`) without wiring individual hooks:

```ts
@monitor({ match: query<[Entity, Health], With<Unit>, With<Dead>>() })
class DeathMonitor {
	onEnter(entity: Entity, health: Health, commands: Commands) {
		print(entity, "died");
		commands.despawn(entity);
	}
}
```

## Buffered damage-over-time

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

## See also

- [Events](05-events.md)
- [Observers](06-observers.md)
- [Monitors](18-monitors.md)
- [Systems and injection](17-systems-and-injection.md)
