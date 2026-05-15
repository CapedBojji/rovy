# Components, Tags, Resources

## Components

Components are authored as classes. Constructor parameters become fields.

```ts
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
```

## Tags

Tags are empty classes. No fields, no instance state.

```ts
export class Unit {}
export class Dead {}
```

Tags may be passed as class constructors instead of instances when spawning.

## Spawning

```ts
const slime = world.spawn(
	Unit,
	new Position(new Vector2(2, 3), 0),
	new Health(100, 100),
);
```

Rules:

- Tag → pass constructor (`Unit`).
- Component with data → pass instance (`new Position(...)`).

## Resources

Resources are singleton world-level objects. One per class. Not attached to any entity.

```ts
export class BattleClock {
	constructor(
		public tick = 0,
		public delta = 1 / 30,
	) {}
}
```

Usage:

```ts
world.insertResource(new BattleClock());

const clock = world.resource(BattleClock);
clock.tick += 1;
```

Use resources for global state: clocks, RNG, config, scoreboards.

## See also

- [Queries](03-queries.md)
- [Commands](04-commands.md)
