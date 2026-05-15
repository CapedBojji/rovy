# Transformer

The roblox-ts transformer handles compile-time work that runtime TypeScript cannot do: resolving generic interface types and producing stable runtime identifiers.

## Responsibilities

All of the following happen at **build time**. Nothing below runs at Luau startup.

1. Scan all files for ECS trait macro calls (`trait<T>`, `allTraits<T>`, `hasTrait<T>`).
2. Resolve generic interface types via TypeScript `TypeChecker` (erased at runtime — must happen now).
3. Generate stable trait IDs from canonical module paths.
4. Scan classes for `implements` clauses matching discovered trait interfaces.
5. Register those classes as trait implementations.
6. Scan `@system`-decorated classes — read `run` param types, extract `Query<...>` descriptors, resource deps, event readers/writers.
7. Hoist `query(...)` call sites to module-level constants (pre-built jecs query handles).
8. Rewrite trait macro calls to runtime trait tokens.
9. Register component/resource/event classes as needed.
10. Generate a central metadata manifest (`EcsMetadata`) with all systems, components, traits, events, resources.

## Inference boundary

Do not structurally infer trait implementations from method names. Only `implements` clauses count.

Counts:

```ts
class Stunned implements CrowdControl {}
```

Does not count automatically:

```ts
class SomeClass {
	blocksMovement() {
		return true;
	}
}
```

## Metadata manifest

Prefer a generated manifest over side-effect registration.

Reason:

```txt
Roblox ModuleScripts do not run unless required.
```

So a component module that registers itself on import is silently absent if no game code happens to require it. The manifest is one module that explicitly references every registered class, ensuring all of them load.

Generated conceptual manifest:

```ts
export const EcsMetadata = {
	components: [
		Stunned,
		Rooted,
		Health,
		Position,
	],
	traits: [
		{
			id: "src/battle/traits/CrowdControl",
			impls: [Stunned, Rooted],
		},
	],
	events: [
		DamageTaken,
		UnitDied,
	],
	resources: [
		BattleClock,
	],
};
```

Boot:

```ts
app.addMetadata(EcsMetadata);
```

## Stable IDs

Do not use bare names:

```ts
__ecs.trait("CrowdControl")
```

Use fully-qualified module paths:

```ts
__ecs.trait("src/shared/battle/traits/CrowdControl")
```

Reason: avoid collisions across files that happen to share a type name.

## See also

- [Trait runtime](09-trait-runtime.md)
- [Trait observers](10-trait-observers.md)
