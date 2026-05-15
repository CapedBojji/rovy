# Monitors

> **Compile-time.** `@monitor` decorator with `match: query<...>()` macro. Transformer reads the query type params, builds an archetype-based monitor, and validates `onEnter`/`onExit`/`onChange` param types match the query terms. All component lifecycle reactions go through monitors — [observers](06-observers.md) are event-only.

Monitors track when entities enter, exit, or change within a query's archetype match.

- `@observer`: "DamageTaken event was triggered"
- `@monitor`: "entity now matches `[Health, Position] + Unit - Dead`"

## Basic usage

```ts
@monitor({ match: query<[Health, Position], With<Unit>, Without<Dead>>() })
class ValidTargetMonitor {
	onEnter(entity: Entity, health: Health, position: Position, commands: Commands) {
		print("new valid target:", entity);
	}

	onExit(entity: Entity, health: Health, position: Position, commands: Commands) {
		print("target invalidated");
	}

	onChange(entity: Entity, health: Health, position: Position, commands: Commands) {
		print("target data changed");
	}
}
```

All three methods are optional. Implement only what you need.

## Methods

| Method | Fires when | Values available |
|--------|-----------|------------------|
| `onEnter` | entity transitions into query match | yes — just entered archetype |
| `onExit` | entity transitions out of query match | yes — jecs fires `on_remove` before archetype transition |
| `onChange` | any term component is `set()` while entity matches | yes — entity still in archetype |

## Match macro

`query<Terms, ...Filters>()` in the decorator is a compile-time macro — same pattern as `trait<T>()`. Transformer resolves the generics, builds the descriptor.

```ts
interface MonitorOptions {
	match: QueryToken;   // query<...>() macro result
}
```

## Single-component monitor

Replaces `@observer({ on: "add", watch: Stunned })` from before:

```ts
@monitor({ match: query<[Stunned]>() })
class StunMonitor {
	onEnter(entity: Entity, stunned: Stunned, commands: Commands) {
		commands.remove(entity, CurrentCast);
		commands.remove(entity, Moving);
	}

	onExit(entity: Entity, stunned: Stunned, commands: Commands) {
		print("stun ended on", entity);
	}
}
```

## Trait monitors

`Trait<T>` in match query — expands to one monitor per implementer.

```ts
@monitor({ match: query<[Trait<CrowdControl>], With<Unit>>() })
class CrowdControlMonitor {
	onEnter(entity: Entity, cc: CrowdControl, commands: Commands) {
		if (cc.blocksMovement()) commands.remove(entity, Moving);
		if (cc.blocksCasting()) commands.remove(entity, CurrentCast);
	}

	onChange(entity: Entity, cc: CrowdControl, commands: Commands) {
		// CrowdControl data was set() while entity still has it
	}

	onExit(entity: Entity, cc: CrowdControl, commands: Commands) {
		print("crowd control removed");
	}
}
```

## Relation monitors

`Pair<R>` in match query — tracks relationship enter/exit.

```ts
@monitor({ match: query<[Health, Pair<ChildOf>]>() })
class ChildWithHealthMonitor {
	onEnter(entity: Entity, health: Health, parent: Pair<ChildOf>, commands: Commands) {
		print(entity, "has health and is child of", parent.target);
	}

	onExit(entity: Entity, health: Health, parent: Pair<ChildOf>, commands: Commands) {
		print(entity, "lost health or parent");
	}
}
```

## Mixed terms

Components, traits, relations — all composable.

```ts
@monitor({ match: query<[Health, Trait<CrowdControl>, Pair<BelongsTo>], With<Unit>, Without<Dead>>() })
class FullMonitor {
	onEnter(entity: Entity, health: Health, cc: CrowdControl, team: Pair<BelongsTo>, commands: Commands) {
		print(entity, "is a living CC'd unit on team", team.target);
	}
}
```

## Optional terms

`Optional<C>` always matches — binds if present, `undefined` if not. Enter/exit driven by non-optional terms.

```ts
@monitor({ match: query<[Health, Optional<Shield>]>() })
class ShieldedOrNot {
	onEnter(entity: Entity, health: Health, shield: Shield | undefined) {
		if (shield) print("has shield:", shield.amount);
	}
}
```

## Injected params

Same injection as systems — queries, resources, etc.

```ts
@monitor({ match: query<[Health], With<Unit>>() })
class UnitHealthMonitor {
	onEnter(
		entity: Entity,
		health: Health,
		commands: Commands,
		clock: Res<BattleClock>,
		allUnits: Query<[Entity, Health], With<Unit>>,
	) {
		print("unit entered at tick", clock.tick, "total:", allUnits.size());
	}
}
```

## Param validation

Transformer validates: `onEnter`/`onExit`/`onChange` component params must match query terms in order. `Entity`, `Commands`, `Res<T>`, `Query<...>`, `World` allowed anywhere.

```ts
// match: query<[Health, Position]>()
onEnter(entity: Entity, health: Health, position: Position, commands: Commands)  // ✅
onEnter(entity: Entity, position: Position, health: Health)                      // ❌ wrong order
onEnter(entity: Entity, health: Health, armor: Armor)                            // ❌ Armor not in terms
```

## Compatibility table

| Term/Filter | In monitor? | Notes |
|-------------|------------|-------|
| Component | yes | |
| `Entity` | yes | |
| `Trait<T>` | yes | expands per implementer |
| `AllTraits<T>` | yes | |
| `Pair<R>` | yes | archetype-level pair |
| `Optional<C>` | yes | always matches, binds if present |
| `With<C>` | yes | filter |
| `Without<C>` | yes | filter |
| `HasTrait<T>` | yes | filter |
| `HasPair<R>` | yes | filter |
| `Changed<C>` | **no** | tick-based; use `onChange` method instead |
| `Added<C>` | **no** | tick-based; use `onEnter` method instead |

## Internal implementation

Based on jecs hooks and the jecs-utils pattern.

### Archetype tracking

Build a set of matching archetype IDs. Keep it live via `observe_archetypes` which hooks into jecs's internal `EcsOnArchetypeCreate`/`EcsOnArchetypeDelete` events through `world.observable`.

```ts
const matching = new Set<number>();

for (const arch of jecsQuery.archetypes()) {
	matching.add(arch.id);
}

const disconnect = observeArchetypes(world, jecsQuery,
	(arch) => matching.add(arch.id),
	(arch) => matching.delete(arch.id),
);
```

`observeArchetypes` registers into `world.observable[ArchetypeCreate]` and `world.observable[ArchetypeDelete]`, keyed by query's first component. When a new archetype is created that matches the query, it's added to the set.

### Enter/exit detection

For each **term** component, hook `world:added` and `world:removed`:

```ts
// ADDED — entity gained a term component
world.added(termId, (entity, id, value, srcArchetype) => {
	// jecs moves entity BEFORE firing on_add
	// srcArchetype = where entity was, record.archetype = where it is now
	const dst = jecs.record(world, entity).archetype;

	if (!matching.has(srcArchetype.id) && matching.has(dst.id)) {
		callbacks.onEnter(entity);
	}
});

// REMOVED — entity lost a term component
world.removed(termId, (entity, id, deleting) => {
	// jecs fires on_remove BEFORE moving entity
	// record.archetype = still the current (source) archetype
	const src = jecs.record(world, entity).archetype;
	const dst = deleting
		? world.ROOT_ARCHETYPE
		: jecs.archetype_traverse_remove(world, id, src);

	if (matching.has(src.id) && !matching.has(dst.id)) {
		callbacks.onExit(entity);
	}
});
```

### `without` terms — inverted logic

Adding a `Without<Dead>` component (`Dead` gets added to entity) can cause exit. Removing `Dead` can cause enter.

```ts
for (const wid of withoutTerms) {
	// entity GAINED a "without" component → might EXIT
	world.added(wid, (entity, id, value, srcArchetype) => {
		const dst = jecs.record(world, entity).archetype;
		if (matching.has(srcArchetype.id) && !matching.has(dst.id)) {
			callbacks.onExit(entity);
		}
	});

	// entity LOST a "without" component → might ENTER
	world.removed(wid, (entity, id, deleting) => {
		const src = jecs.record(world, entity).archetype;
		const dst = deleting
			? world.ROOT_ARCHETYPE
			: jecs.archetype_traverse_remove(world, id, src);
		if (!matching.has(src.id) && matching.has(dst.id)) {
			callbacks.onEnter(entity);
		}
	});
}
```

### onChange detection

For each term component, hook `world:changed`. Only fires if entity currently matches.

```ts
world.changed(termId, (entity) => {
	const arch = jecs.record(world, entity).archetype;
	if (matching.has(arch.id)) {
		callbacks.onChange(entity);
	}
});
```

`onChange` fires per `set()` call, not deduplicated per step. If both `Health` and `Armor` are `set()` in the same step, `onChange` fires twice.

### jecs APIs used

| API | Purpose |
|-----|---------|
| `query:archetypes()` | initial matching set |
| `world.observable[ArchetypeCreate/Delete]` | live archetype tracking |
| `world:added(comp, cb)` | cb: `(entity, id, value, srcArchetype)` |
| `world:removed(comp, cb)` | cb: `(entity, id, deleting)` |
| `world:changed(comp, cb)` | cb: `(entity)` |
| `jecs.record(world, entity)` | get current archetype |
| `jecs.archetype_traverse_remove(world, id, arch)` | compute destination archetype |
| `world.ROOT_ARCHETYPE` | empty archetype (entity being deleted) |

### Hook timing

| Hook | When entity moves | Source archetype | Dest archetype |
|------|-------------------|-----------------|----------------|
| `on_add` | already moved | `srcArchetype` param | `record.archetype` |
| `on_remove` | not yet moved | `record.archetype` | compute via `archetype_traverse_remove` |
| `on_change` | no move | `record.archetype` | same |

## Trait lifecycle

Trait lifecycle reactions are monitors with `Trait<T>` in the match query. Transformer expands to one monitor per registered implementer.

```ts
@monitor({ match: query<[Trait<CrowdControl>]>() })
class CrowdControlMonitor {
	onEnter(entity: Entity, cc: CrowdControl, commands: Commands) {
		if (cc.blocksCasting()) commands.remove(entity, CurrentCast);
		if (cc.blocksMovement()) commands.remove(entity, Moving);
	}

	onChange(entity: Entity, cc: CrowdControl, commands: Commands) {
		// a CrowdControl implementer's data was set()
	}

	onExit(entity: Entity, cc: CrowdControl, commands: Commands) {
		print("crowd control removed from", entity);
	}
}
```

`cc` is the concrete implementer instance, typed as the trait interface.

Lowering:

```txt
@monitor({ match: query<[Trait<CrowdControl>]>() })
  → monitor matching [Stunned]   (upcast to CrowdControl)
  → monitor matching [Rooted]    (upcast to CrowdControl)
  → monitor matching [Frozen]    (upcast to CrowdControl)
  → monitor matching [Silenced]  (upcast to CrowdControl)
```

All point to the same `onEnter`/`onExit`/`onChange`. With filters:

```ts
@monitor({ match: query<[Trait<CrowdControl>], With<Unit>, Without<Dead>>() })
class LivingUnitCCMonitor {
	onEnter(entity: Entity, cc: CrowdControl, commands: Commands) {
		// only living units
	}
}
```

Separate monitors for multiple traits — one class each:

```ts
@monitor({ match: query<[Trait<CrowdControl>]>() })
class OnCrowdControl {
	onEnter(entity: Entity, cc: CrowdControl, commands: Commands) { ... }
}

@monitor({ match: query<[Trait<Expirable>]>() })
class OnExpirable {
	onEnter(entity: Entity, exp: Expirable, commands: Commands) { ... }
}
```

## Monitor vs observer

| | `@monitor` | `@observer` |
|--|------------|-------------|
| Triggers on | archetype match enter/exit/change | triggered/sent events |
| Source | jecs hooks on query match | explicit `commands.trigger()` / `commands.send()` |
| Methods | `onEnter`, `onExit`, `onChange` | `run` |
| Scope | query-level lifecycle | event-level |
| Values | component instances from matched entity | event instance |

## See also

- [Observers](06-observers.md) — event-only reactions
- [Queries](03-queries.md)
- [Traits](08-traits.md)
- [Trait runtime](09-trait-runtime.md)
- [Relationships](11-relationships.md)
- [Change detection](16-change-detection.md)
