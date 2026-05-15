# Roadmap

## Next work item

Design the exact TypeScript type signatures for:

```ts
query(...)
trait<T>()
allTraits<T>()
hasTrait<T>()
app.onAddTrait<T>()
commands.trigger(...)
world.spawn(...)
```

This is where most of the Roblox-TS API difficulty will be:

- variadic tuple inference for query terms
- mapping component-class terms → bound instance types
- distinguishing `Entity` term from component terms
- typing `optional(C)` as `C | undefined`
- typing `trait<T>()` term as `T`
- typing `allTraits<T>()` term as `T[]`
- `hasTrait<T>()` as filter (no binding)

## Suggested order after types

1. Scaffold roblox-ts package layout (`src/`, `tsconfig`, jecs dep).
2. Runtime: `World`, `App`, `Commands`, event buffers, resources.
3. Query runtime (component terms first, traits second).
4. Scheduler: schedules, sets, flush loop.
5. Observer dispatcher: event + lifecycle.
6. Transformer: macro lowering, manifest generation.
7. Trait runtime: discovery from manifest, query expansion.
8. Relationship wrapper (after [Relationships](12-relationships.md) is resolved).
9. Battle sim example app exercising the full surface.

## See also

- [API reference](13-api-reference.md)
- [Open questions](16-open-questions.md)
