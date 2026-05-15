# Relationships

> **Compile-time.** `@relation` decorator marks a class as a relationship. The transformer injects a `rovy.__relation` registration; `app.start()` wires jecs pair operations. Relationships are classes — they have runtime identity, no macro needed for value positions.

Relationships connect two entities with a typed edge. Built on jecs pairs under the hood.

## Defining relationships

```ts
@relation
class ChildOf {}

@relation({ exclusive: true })
class BelongsTo {}

// relations can carry data
@relation
class Targets {
	constructor(public priority: number) {}
}

// cleanup policies
@relation({
	exclusive: true,
	onTargetDelete: "cascade",
})
class OwnedBy {}
```

## Decorator options

```ts
interface RelationOptions {
	exclusive?: boolean;                              // one target per relation per entity (default: false)
	onTargetDelete?: "cascade" | "remove" | "none";   // target despawned → what happens to pair holder
	onDelete?: "cascade" | "remove" | "none";          // pair holder despawned → what happens
}
```

| Policy | Meaning |
|--------|---------|
| `cascade` | despawn the entity holding the pair |
| `remove` | remove the pair silently |
| `none` | leave dangling (default) |

`exclusive: true` — adding a new pair of the same relation auto-removes the old one. Useful for `BelongsTo`, `OwnedBy` where an entity can only have one parent/owner.

## Commands

Tag relation (no data):

```ts
commands.relate(child, ChildOf, parent);
commands.unrelate(child, ChildOf, parent);
```

Data relation:

```ts
commands.relate(unit, Targets, enemy, new Targets(1));
commands.unrelate(unit, Targets, enemy);
```

Immediate via world:

```ts
world.relate(child, ChildOf, parent);
world.unrelate(child, ChildOf, parent);
world.hasRelation(child, ChildOf, parent);
world.getRelation(unit, Targets, enemy); // Targets | undefined
```

## Querying relationships

`Pair<R>` as query term — wildcard, matches all targets of that relation.

```ts
@system({ schedule: Update, set: HierarchySet })
class UpdateChildren {
	run(q: Query<[Entity, Pair<ChildOf>]>) {
		q.forEach((entity, pair) => {
			print(entity, "is child of", pair.target);
		});
	}
}
```

Data relation — `pair.data` is typed:

```ts
@system({ schedule: Update, set: CombatSet })
class ProcessTargeting {
	run(q: Query<[Entity, Pair<Targets>]>) {
		q.forEach((entity, pair) => {
			print(entity, "targets", pair.target, "priority:", pair.data.priority);
		});
	}
}
```

## Pair binding type

`Pair<R>` binds to:

```ts
// tag relation (no constructor data)
{ target: Entity }

// data relation
{ target: Entity, data: R }
```

## Filtering by specific target

Runtime value — filter on the query handle:

```ts
run(q: Query<[Entity, Pair<ChildOf>]>) {
	q.withTarget(specificParent).forEach((entity, pair) => {
		// only children of specificParent
	});
}
```

## Filter-only

`HasPair<R>` — filter without binding:

```ts
run(
	q: Query<[Entity, Health], HasPair<ChildOf>>,
) {
	q.forEach((entity, health) => {
		// entity has at least one ChildOf pair
	});
}
```

## Relationship monitors

Relationship lifecycle (enter, exit, change) uses `@monitor` with `Pair<R>` in the match query. Observers are event-only — see [Observers](06-observers.md).

```ts
@monitor({ match: query<[Pair<ChildOf>]>() })
class ChildMonitor {
	onEnter(entity: Entity, parent: Pair<ChildOf>, commands: Commands) {
		print(entity, "became child of", parent.target);
	}

	onExit(entity: Entity, parent: Pair<ChildOf>, commands: Commands) {
		print("child relation removed from", entity);
	}
}

@monitor({ match: query<[Pair<Targets>]>() })
class TargetMonitor {
	onChange(entity: Entity, targets: Pair<Targets>, commands: Commands) {
		print("target data changed on", entity);
	}
}
```

Combine with components and filters for precise matching:

```ts
@monitor({ match: query<[Health, Pair<ChildOf>], With<Unit>>() })
class ChildWithHealthMonitor {
	onEnter(entity: Entity, health: Health, parent: Pair<ChildOf>, commands: Commands) {
		print(entity, "has health and is child of", parent.target);
	}
}
```

All three methods (`onEnter`, `onExit`, `onChange`) are optional — implement only what you need. For full monitor options see [Monitors](18-monitors.md).

## Query summary

| Query type | Rows | Binds to |
|------------|------|----------|
| `Pair<R>` | per pair (wildcard all targets) | `{ target, data? }` |
| `HasPair<R>` | filter | nothing |
| `q.withTarget(e)` | narrows to specific target | same binding |

## Registration output

Transformer injects a side-effect call after each `@relation` class:

```ts
class ChildOf {}
rovy.__relation(ChildOf, { exclusive: false, onTargetDelete: "none", onDelete: "none" });

class OwnedBy {}
rovy.__relation(OwnedBy, { exclusive: true, onTargetDelete: "cascade", onDelete: "none" });
```

`app.start()` allocates jecs pair IDs and applies cleanup policies. See [Compiled output](19-compiled-output.md).

## See also

- [Queries](03-queries.md)
- [Commands](04-commands.md)
- [Observers](06-observers.md)
