# Trait Observers

Trait observers fire when any implementer of the trait is added, changed, or removed. Uses `@observer` with `trait:` option — `trait<T>()` macro provides the runtime token for the decorator value position.

## Example

```ts
@observer({ on: "add", trait: trait<CrowdControl>() })
class OnCrowdControlApplied {
	run(entity: Entity, value: CrowdControl, commands: Commands) {
		if (value.blocksCasting()) {
			commands.remove(entity, CurrentCast);
		}
		if (value.blocksMovement()) {
			commands.remove(entity, Moving);
		}
	}
}
```

`value` is the concrete implementer instance, typed as the trait interface. `trait<CrowdControl>()` in the decorator is the compile-time macro — gives the interface a value-position identity.

## Why `trait<T>()` here

Decorator args are value positions. Interfaces have no runtime identity. `trait<T>()` bridges the gap:

```ts
// ❌ Interface can't appear in value position
@observer({ on: "add", trait: CrowdControl })

// ✅ Macro produces runtime token
@observer({ on: "add", trait: trait<CrowdControl>() })
```

Compare with queries — `Trait<CrowdControl>` in type position needs no token:

```ts
// ✅ Type position — transformer reads directly
run(q: Query<[Entity, Trait<CrowdControl>]>) { ... }
```

## Lowering

Transformer expands each trait observer into one concrete component observer per implementer:

```txt
@observer({ on: "add", trait: trait<CrowdControl>() })
  → observer for Stunned (upcast to CrowdControl)
  → observer for Rooted (upcast to CrowdControl)
  → observer for Frozen (upcast to CrowdControl)
  → observer for Silenced (upcast to CrowdControl)
```

All point to the same `run`. Value upcast to interface type.

## Stacking for multiple traits

Single trait per decorator. Stack for multiple:

```ts
@observer({ on: "add", trait: trait<CrowdControl>() })
@observer({ on: "add", trait: trait<Debuff>() })
class OnStatusApplied {
	run(entity: Entity, value: CrowdControl | Debuff, commands: Commands) {
		// fires for any CrowdControl or Debuff implementer
	}
}
```

Or separate classes for clean typing:

```ts
@observer({ on: "add", trait: trait<CrowdControl>() })
class OnCrowdControl {
	run(entity: Entity, value: CrowdControl, commands: Commands) { ... }
}

@observer({ on: "add", trait: trait<Debuff>() })
class OnDebuff {
	run(entity: Entity, value: Debuff, commands: Commands) { ... }
}
```

## Change and remove

```ts
@observer({ on: "change", trait: trait<CrowdControl>() })
class OnCrowdControlChanged {
	run(entity: Entity, prev: CrowdControl, next: CrowdControl, commands: Commands) {
		print(prev.getExpiresAtTick(), "→", next.getExpiresAtTick());
	}
}

@observer({ on: "remove", trait: trait<CrowdControl>() })
class OnCrowdControlRemoved {
	run(entity: Entity, commands: Commands) {
		print("crowd control removed from", entity);
	}
}
```

## With queries and resources

Same injection as any observer:

```ts
@observer({ on: "add", trait: trait<CrowdControl>() })
class OnCrowdControlWithContext {
	run(
		entity: Entity,
		value: CrowdControl,
		commands: Commands,
		clock: Res<BattleClock>,
		units: Query<[Entity, Team]>,
	) {
		// cross-reference other queries
	}
}
```

## Updated decorator options

```ts
interface ObserverOptions {
	on?: "add" | "insert" | "change" | "remove";
	watch?: ComponentCtor | ComponentCtor[];     // component class (value position, has identity)
	trait?: TraitToken;                          // trait<T>() macro result (value position, needs macro)
	match?: "any" | "all";                       // for watch arrays, default: "any"
	event?: EventCtor;                           // @event-decorated class
	priority?: number;                           // higher runs first, default: 0
}
```

## See also

- [Traits](08-traits.md)
- [Trait runtime](09-trait-runtime.md)
- [Observers](06-observers.md)
