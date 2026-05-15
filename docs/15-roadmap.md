# Roadmap

The API surface and type model are designed across [Queries](03-queries.md), [Systems](17-systems-and-injection.md), [Monitors](18-monitors.md), [Change detection](16-change-detection.md), [Compiled output](19-compiled-output.md), and [Runtime lifecycle](20-runtime-lifecycle.md). Next is implementation.

## Implementation order

The transformer targets the `rovy.__*` registry API, so the registry contract is defined first; the two then co-develop.

1. **`rovy` registry contract** — define every `rovy.__component`/`__resource`/`__event`/`__system`/`__observer`/`__monitor`/`__relation`/`__schedule`/`__traitImpl`/`__query` signature + descriptor shapes. This is the transformer↔runtime boundary.
2. **Transformer skeleton** — decorator scanning, `TypeChecker` resolution for `trait<T>()` / `query<...>()` / `Trait<T>`, stable IDs, `rovy.__*` registration-call injection + query hoisting.
3. **Core runtime** — `rovy` registries + `loadPaths`, `app.start()` finalize pass (ID allocation, resource auto-instantiation, ordering), `World` wrapper, `App`, `Commands` buffer, resource store, event buffers.
4. **Query runtime** — term binding, filters (`With`/`Without`/`Optional`), then `Changed`/`Added`/`Removed` (tick-based), then trait expansion and `Pair<R>`.
5. **Scheduler** — custom schedules, `@schedule`, sets via `configureSets`, flush loop at set boundaries. Optional `StandardPlugin`.
6. **Observer dispatch** — event-only, priority ordering, deferred vs immediate trigger.
7. **Monitor wiring** — archetype tracking via jecs `observable` hooks, `onEnter`/`onExit`/`onChange` (see [Change detection](16-change-detection.md) and [Monitors](18-monitors.md)).
8. **Trait expansion** — lower `Trait<T>` queries/monitors to per-implementer jecs queries from the trait registry.
9. **Relationship wrapper** — `@relation`, `Pair<R>`, cleanup policies over jecs pairs.
10. **Param injection codegen** — wire `run`/`onEnter`/`onExit`/`onChange` params from the `rovy.__*` registration descriptors.
11. **Generic example app** — exercise the full surface end to end.

## Risk areas

- Variadic tuple inference for `Query<[Terms], ...Filters>` param types in roblox-ts.
- `TypeChecker` resolution of interface generics inside the transformer (traits erased at runtime).
- Monitor archetype-transition correctness with `Without` terms (inverted hook logic).
- Determinism of flush loop under observer-produced commands.
- `rovy.loadPaths(...)` coverage — a module not under a loaded path silently fails to register. Need a dev-mode check / clear error when `app.start()` finalizes references to an unregistered class.
- Cross-module load order: `rovy.__*` calls must be order-independent (they are — finalize resolves all IDs in one pass), but circular `require` during `loadPaths` could surface; verify recursive require is safe.
- `@resource` default-constructor enforcement — transformer must reject `@resource` classes whose constructor has non-defaulted params (auto-instantiation needs `ctor.new()` with no args).

## See also

- [API reference](12-api-reference.md)
- [Decisions](14-decisions.md)
- [Transformer](10-transformer.md)
- [Compiled output](19-compiled-output.md)
- [Runtime lifecycle](20-runtime-lifecycle.md)
