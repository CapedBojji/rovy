# Locked Decisions

These are settled. Change only with a strong reason.

- Build on top of jecs. Do not fork.
- Class-based components, events, resources.
- Interface-based traits.
- Traits do not need to extend `EcsTrait`.
- Runtime traits are discovered from ECS trait macro usage only.
- Classes must explicitly `implements Trait`.
- Do not structurally infer trait implementations from method shape.
- `query(Entity, trait<T>())` returns one row per matching component.
- `allTraits<T>()` returns one row per entity with an array of trait values.
- `hasTrait<T>()` is filter-only.
- Observers do not consume events.
- Commands are deferred.
- Flush at schedule/set boundaries, not after every system.
- Generate a metadata manifest; do not rely on import side effects.

## See also

- [Open questions](16-open-questions.md)
