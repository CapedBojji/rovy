# Queries

> **Compile-time.** Queries are declared as `Query<...>` param types on a system's `run` method. The transformer reads these types at build time, hoists them to pre-built jecs query descriptors, and injects resolved handles at runtime. You never call `query(...)` yourself — the type annotation is the query.

## Declaring a query

Queries live in the `run` param list. Terms go in the first tuple. Filters follow as additional type params.

```ts
@system({ schedule: Update, set: MovementSet })
class PrintPositions {
	run(q: Query<[Position]>) {
		q.forEach((position) => {
			print(position.cell);
		});
	}
}
```

## Entity term

Queries do not return entity handles by default. Add `Entity` to the term tuple to opt in.

```ts
@system({ schedule: Update, set: MovementSet })
class PrintEntityPositions {
	run(q: Query<[Entity, Position]>) {
		q.forEach((entity, position) => {
			print(entity, position.cell);
		});
	}
}
```

All entities:

```ts
run(q: Query<[Entity]>) {
	q.forEach((entity) => {
		print(entity);
	});
}
```

## Filters

`With<C>` requires component without binding it. `Without<C>` excludes.

```ts
run(
	q: Query<[Entity, Position, Health], With<Unit>, Without<Dead>>,
) {
	q.forEach((entity, position, health) => {
		print(position.cell, health.current);
	});
}
```

## Optional

`Optional<C>` in the term tuple yields `C | undefined`. Row appears whether or not entity has `C`.

```ts
run(
	q: Query<[Entity, Position, Optional<Target>]>,
) {
	q.forEach((entity, position, target) => {
		if (target) {
			print(target.entity);
		}
	});
}
```

## Change detection

`Changed<C>` filter keeps only rows where `C` was set or added since this system last ran.

```ts
run(
	q: Query<[Entity, Health], Changed<Health>>,
) {
	q.forEach((entity, health) => {
		// only fires when Health was mutated via commands.set or just added
	});
}
```

## Added detection

`Added<C>` filter keeps only rows where `C` was added since this system last ran.

```ts
run(
	q: Query<[Entity, Poisoned], Added<Poisoned>>,
) {
	q.forEach((entity, poisoned) => {
		// only fires on first step after Poisoned was inserted
	});
}
```

## Multiple filters

Filters are AND. Chain them as additional type params.

```ts
run(
	q: Query<[Entity, Health], With<Unit>, Without<Dead>, Changed<Health>>,
) {
	q.forEach((entity, health) => {
		// Unit + not Dead + Health changed
	});
}
```

## Multiple queries

Systems and observers can declare multiple `Query<...>` params. Each is built and injected independently.

```ts
@system({ schedule: Update, set: DamageSet })
class ProcessDamageEvents {
	run(
		commands: Commands,
		events: EventReader<DamageTaken>,
		units: Query<[Entity, Health], Without<Dead>>,
		shields: Query<[Entity, Shield]>,
		clock: Res<BattleClock>,
	) {
		events.forEach((event) => {
			// cross-reference shields query independently
		});
	}
}
```

No limit on query count per system or observer.

## Query handle API

The injected handle is bound to its world — no extra `world` arg needed.

```ts
q.forEach((entity, pos) => { /* ... */ });  // iterate all matching rows
q.size();                                    // number of matching rows
q.first();                                   // first row or undefined
for (const [entity, pos] of q) { /* ... */ } // iterable
```

## Summary of term and filter types

| In term tuple | Binds to |
|---------------|----------|
| `Entity` | entity id |
| `ComponentClass` | component instance |
| `Optional<C>` | `C \| undefined` |
| `Trait<T>` | one matching trait impl per row |
| `AllTraits<T>` | `T[]` for all impls on entity |

| Filter type param | Effect |
|-------------------|--------|
| `With<C>` | must have C, no binding |
| `Without<C>` | must not have C |
| `HasTrait<T>` | must have any impl of T |
| `Changed<C>` | C added or set since last run |
| `Added<C>` | C added since last run |
| `Removed<C>` | C removed since last run (binds `Entity` only) |

## See also

- [Trait queries](/concepts/trait-runtime.md)
- [Commands](/concepts/commands.md)
- [Change detection](/concepts/change-detection.md)
- [Systems and injection](/concepts/systems-and-injection.md)
