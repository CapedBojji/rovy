# Examples — Battle ECS

Worked examples for the auto-battler use case.

## Components

```ts
export class Unit {}
export class Dead {}

export class Position {
	constructor(
		public cell: Vector2,
		public facingAngle: number,
	) {}
}

export class Health {
	constructor(
		public current: number,
		public max: number,
	) {}
}

export class Team {
	constructor(
		public value: "Player" | "Enemy",
	) {}
}

export class Target {
	constructor(
		public entity: Entity,
	) {}
}

export class CurrentCast {
	constructor(
		public abilityId: string,
		public target: Entity | undefined,
		public startedAtTick: number,
		public endsAtTick: number,
		public phase: "Prepare" | "Active" | "Recovery",
	) {}
}

export class Cooldowns {
	constructor(
		public byAbilityId: Map<string, number>,
	) {}
}

export class Poisoned {
	constructor(
		public damagePerTick: number,
		public expiresAtTick: number,
		public source?: Entity,
	) {}
}
```

## Events

```ts
export class TryCastAbility {
	constructor(
		public caster: Entity,
		public abilityId: string,
		public target?: Entity,
	) {}
}

export class CastStarted {
	constructor(
		public caster: Entity,
		public abilityId: string,
		public target?: Entity,
	) {}
}

export class CastCompleted {
	constructor(
		public caster: Entity,
		public abilityId: string,
		public target?: Entity,
	) {}
}

export class DamageTaken {
	constructor(
		public target: Entity,
		public amount: number,
		public source?: Entity,
		public damageType: "Physical" | "Fire" | "Ice" | "Poison" = "Physical",
	) {}
}

export class UnitDied {
	constructor(
		public unit: Entity,
		public killer?: Entity,
	) {}
}
```

## Ability flow

Trigger a cast:

```ts
commands.trigger(new TryCastAbility(slime, "SlimeBash", knight));
```

Observer validates and starts the cast:

```ts
app.addObserver(TryCastAbility, ({ event, world, commands }) => {
	const clock = world.resource(BattleClock);

	const cooldowns = world.get(event.caster, Cooldowns);
	const readyAt = cooldowns?.byAbilityId.get(event.abilityId);

	if (readyAt !== undefined && clock.tick < readyAt) {
		return;
	}

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

	commands.trigger(new CastStarted(
		event.caster,
		event.abilityId,
		event.target,
	));
});
```

System completes casts at their end tick:

```ts
const completeCasts = system((world, commands) => {
	const clock = world.resource(BattleClock);

	query(Entity, CurrentCast).forEach(world, (caster, cast) => {
		if (clock.tick < cast.endsAtTick) return;

		commands.remove(caster, CurrentCast);

		commands.trigger(new CastCompleted(
			caster,
			cast.abilityId,
			cast.target,
		));
	});
});
```

Ability-specific observer reacts to completion:

```ts
app.addObserver(CastCompleted, ({ event, commands }) => {
	if (event.abilityId !== "SlimeBash") return;
	if (!event.target) return;

	commands.trigger(new DamageTaken(
		event.target,
		15,
		event.caster,
		"Physical",
	));
});
```

## See also

- [Events](05-events.md)
- [Observers](06-observers.md)
- [Schedules](07-schedules.md)
