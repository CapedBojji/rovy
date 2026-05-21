# Trait Runtime — Discovery, Lowering, Semantics

> **Compile-time.** All trait resolution happens at build time. The transformer resolves interface types via `TypeChecker` and injects a `rovy.__traitImpl(traitId, C)` call for each `@component` `implements` clause. `app.start()` builds the trait registry from those calls. `Trait<T>` in type positions is read directly. `trait<T>()` in value positions is rewritten to a stable runtime token.

## Discovery

Transformer finds traits from:

1. `trait<T>()` macro calls — value position (variables, runtime helpers).
2. `Trait<T>`, `AllTraits<T>`, `HasTrait<T>` — type position in `Query<...>` params and `query<...>()` monitor match.
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

## Registration output

Each `@component` that `implements` a trait gets an injected `rovy.__traitImpl` call keyed by the trait's stable module path:

```ts
class Stunned { ... }
rovy.__component(Stunned, "src/components/Stunned");
rovy.__traitImpl("src/battle/traits/CrowdControl", Stunned);
rovy.__traitImpl("src/battle/traits/Expirable", Stunned);

class Silenced { ... }
rovy.__component(Silenced, "src/components/Silenced");
rovy.__traitImpl("src/battle/traits/CrowdControl", Silenced);
```

Stable ID = canonical module path of the interface. `app.start()` resolves each implementer to its jecs ID and builds the trait registry. See [Runtime lifecycle § Traits](/runtime/lifecycle.md#traits).

## See also

- [Traits](/concepts/traits.md)
- [Trait lifecycle (monitors)](/concepts/monitors.md)
- [Transformer](/runtime/transformer.md)
- [Queries](/concepts/queries.md)
