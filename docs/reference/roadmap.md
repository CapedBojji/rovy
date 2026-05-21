# Roadmap

The API surface and type model are designed across [Queries](/concepts/queries.md), [Systems](/concepts/systems-and-injection.md), [Monitors](/concepts/monitors.md), [Change detection](/concepts/change-detection.md), [Compiled output](/runtime/compiled-output.md), and [Runtime lifecycle](/runtime/lifecycle.md). The implementation now follows that shape.

## Landed implementation order

The transformer targets the `rovy.__*` registry API, so the registry contract is defined first; the two then co-develop.

1. **`rovy` registry contract** — define every `rovy.__component`/`__resource`/`__event`/`__system`/`__observer`/`__monitor`/`__relation`/`__schedule`/`__traitImpl`/`__query` signature + descriptor shapes. This is the transformer↔runtime boundary.
2. **Transformer skeleton** — decorator scanning, `TypeChecker` resolution for `trait<T>()` / `query<...>()` / `Trait<T>`, stable IDs, `rovy.__*` registration-call injection + query hoisting.
3. **Core runtime** — `rovy` registries + `loadPaths`, `app.start()` finalize pass (ID allocation, resource auto-instantiation, ordering), `World` wrapper, `App`, `Commands` buffer, resource store, event buffers.
4. **Query runtime** — term binding, filters (`With`/`Without`/`Optional`), then `Changed`/`Added`/`Removed` (tick-based), then trait expansion and `Pair<R>`.
5. **Scheduler** — custom schedules, `@schedule`, sets via `configureSets`, flush loop at set boundaries. Optional `StandardPlugin`.
6. **Observer dispatch** — event-only, priority ordering, deferred vs immediate trigger.
7. **Monitor wiring** — archetype tracking via jecs `observable` hooks, `onEnter`/`onExit`/`onChange` (see [Change detection](/concepts/change-detection.md) and [Monitors](/concepts/monitors.md)).
8. **Trait expansion** — lower `Trait<T>` queries/monitors to per-implementer jecs queries from the trait registry.
9. **Relationship wrapper** — `@relation`, `Pair<R>`, cleanup policies over jecs pairs.
10. **Param injection codegen** — wire `run`/`onEnter`/`onExit`/`onChange` params from the `rovy.__*` registration descriptors.
11. **Generic example app** — exercise the full surface end to end.

## External signal bridge

External signal translation is now covered by collectors.

Current split:

- keep `@event`, `EventReader`, `EventWriter`, `@observer`, and `@monitor` for ECS-native behavior
- use `@collect` as the bridge for Roblox and Flamework callbacks
- let systems consume collector payloads through `drain()` so gameplay translation stays in normal scheduled systems

See [Collectors](/concepts/collectors.md).

## Networking milestone

The first network-specific layer is intentionally smaller than full replication:

1. `@netEvent` decorator that implies `@event`
2. transformer-generated Blink schema/modules
3. injected `NetClient` / `NetServer` params
4. schedule-owned receive/flush sets
5. compile-time and runtime boundary/direction validation

That milestone stops at typed event transport metadata and runtime handles. Automatic entity/component replication stays out of scope for that first pass. See [Networking](/packages/networking.md).

## Risk areas

- Variadic tuple inference for `Query<[Terms], ...Filters>` param types in roblox-ts.
- `TypeChecker` resolution of interface generics inside the transformer (traits erased at runtime).
- Monitor archetype-transition correctness with `Without` terms (inverted hook logic).
- Determinism of flush loop under observer-produced commands.
- `rovy.loadPaths(...)` coverage — a module not under a loaded path silently fails to register. Need a dev-mode check / clear error when `app.start()` finalizes references to an unregistered class.
- Cross-module load order: `rovy.__*` calls must be order-independent (they are — finalize resolves all IDs in one pass), but circular `require` during `loadPaths` could surface; verify recursive require is safe.
- `@resource` default-constructor enforcement — transformer must reject `@resource` classes whose constructor has non-defaulted params (auto-instantiation needs `ctor.new()` with no args).
- `@collect` default-constructor enforcement — transformer must reject collector classes whose constructor has non-defaulted params (runtime singleton instantiation needs `ctor.new()` with no args).

## See also

- [API reference](/reference/api.md)
- [Decisions](/reference/decisions.md)
- [Transformer](/runtime/transformer.md)
- [Compiled output](/runtime/compiled-output.md)
- [Runtime lifecycle](/runtime/lifecycle.md)
- [Networking](/packages/networking.md)
