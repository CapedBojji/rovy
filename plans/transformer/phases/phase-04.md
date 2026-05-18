### [x] Phase 4 — Traits, macros, relationships, loadPaths

- [x] Rewrite `trait<T>()` to `rovy.traitToken(id)`.
- [x] Rewrite monitor `query<...>()` by hoisting descriptor and storing match id.
- [x] Inject `rovy.__traitImpl(traitId, component)` for explicit component
      `implements`.
- [x] Lower `Trait`, `AllTraits`, `HasTrait`, `Pair`, and `HasPair`.
- [x] Lower resolvable `rovy.loadPaths("src/...")` strings through Rojo output
      paths to Roblox Instance expressions.

