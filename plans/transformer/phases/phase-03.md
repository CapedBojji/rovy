### [x] Phase 3 — Query + param lowering

- [x] Parse `run`, `onEnter`, `onExit`, and `onChange` parameter type nodes.
- [x] Lower injection wrappers and monitor term/entity params.
- [x] Lower `Query<[Terms], ...Filters>` into `QueryDescriptor`.
- [x] Emit one `rovy.__query(descriptor)` per query param and monitor match.

