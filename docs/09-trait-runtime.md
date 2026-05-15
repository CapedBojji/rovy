# Trait Runtime — Discovery, Lowering, Semantics

> **Compile-time.** All trait resolution happens at build time. The transformer resolves interface types via `TypeChecker`, builds the trait registry from `@component` `implements` clauses, and emits everything into the manifest. `Trait<T>` in type positions is read directly. `trait<T>()` in value positions is rewritten to a stable runtime token.

## Discovery

Transformer finds traits from:

1. `trait<T>()` macro calls — value position, e.g. decorator args.
2. `Trait<T>`, `AllTraits<T>`, `HasTrait<T>` — type position in `Query<...>` params.
3. `implements T` on `@component` classes — cross-referenced with above.

Result:

```txt
CrowdControl (trait)
  → Stunned
  → Rooted
  → Frozen
  → Silenced

Expirable (trait)
  → Stunned
  → Rooted
```

## Querying traits

All in type position — no `trait<T>()` token needed.

One row per matching component:

```ts
run(q: Query<[Entity, Trait<CrowdControl>]>) {
	q.forEach((entity, cc) => {
		if (cc.blocksMovement()) {
			print("movement blocked");
		}
	});
}
```

If entity has both `Stunned` and `Rooted`, query yields two rows for that entity.

## Per-entity aggregation

One row per entity, all matching implementers in an array:

```ts
run(q: Query<[Entity, AllTraits<CrowdControl>]>) {
	q.forEach((entity, ccs) => {
		for (const cc of ccs) {
			print(cc.blocksMovement());
		}
	});
}
```

## Filter-only

No binding, just filter entities that have any implementer:

```ts
run(
	q: Query<[Entity, Health], HasTrait<CrowdControl>>,
) {
	q.forEach((entity, health) => {
		print("entity has crowd control");
	});
}
```

## Query lowering

System param:

```ts
q: Query<[Entity, Trait<CrowdControl>]>
```

Transformer expands to multiple jecs queries:

```txt
jecs query [Entity, Stunned]  → upcast to CrowdControl
jecs query [Entity, Rooted]   → upcast to CrowdControl
jecs query [Entity, Frozen]   → upcast to CrowdControl
jecs query [Entity, Silenced] → upcast to CrowdControl
```

Results merged into one iteration.

## Summary

| Query type | Rows | Binds to | Needs `trait<T>()`? |
|------------|------|----------|---------------------|
| `Trait<T>` | per matching component | `T` | no — type position |
| `AllTraits<T>` | per entity | `T[]` | no — type position |
| `HasTrait<T>` | filter | nothing | no — type position |

## Manifest output

```ts
export const EcsMetadata = {
	traits: [
		{
			id: "src/battle/traits/CrowdControl",
			impls: [Stunned, Rooted, Frozen, Silenced],
		},
		{
			id: "src/battle/traits/Expirable",
			impls: [Stunned, Rooted],
		},
	],
	// ...
};
```

Stable ID = canonical module path. Runtime key = the manifest entry index or generated token.

## See also

- [Traits](08-traits.md)
- [Trait observers](10-trait-observers.md)
- [Transformer](11-transformer.md)
- [Queries](03-queries.md)
