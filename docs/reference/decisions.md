# Decisions

Settled design decisions. Change only with a strong reason.

## Locked

- Build on top of jecs. Do not fork.
- Decorator-based authoring: `@component`, `@resource`, `@inspect`, `@event`, `@system`, `@observer`, `@monitor`, `@relation`, `@schedule`, `@set`, `@plugin`.
- Components, resources, events, systems, observers, monitors, relations, schedules, sets are classes.
- Traits are interfaces. `trait<T>()` macro for value positions; `Trait<T>`/`HasTrait<T>`/`AllTraits<T>` for type positions.
- `@component` classes must explicitly `implements Trait`. No structural inference from method shape.
- Queries are compile-time `Query<[Terms], ...Filters>` param types. No runtime `query(...)` calls.
- Param injection: transformer reads `run`/`onEnter`/`onExit`/`onChange` param types and injects.
- Observers are **event-only**. All component/trait/relation lifecycle reactions go through monitors.
- Monitors expose `onEnter` / `onExit` / `onChange`, driven by jecs archetype hooks.
- `Query<[Entity, Trait<T>]>` returns one row per matching component; `AllTraits<T>` one row per entity with array; `HasTrait<T>` filter-only.
- Observers do not consume events. All matching observers run, ordered by `priority`.
- Commands are deferred. Flush at schedule/set boundaries, not after every system.
- Fully custom schedules. No built-in schedules in core; `StandardPlugin` is optional and opt-in.
- Sets are classes extending `SystemSet`. Ordered via `app.configureSets`.
- Relationships are in scope: `@relation` classes, `Pair<R>`/`HasPair<R>`, `commands.relate/unrelate`.
- Change detection filters `Changed<C>` / `Added<C>` / `Removed<C>` are kept as query filters and coexist with `@monitor` onExit/onChange.
- `@resource` auto-registers from default constructor. No manual `app.insertResource()` required. `app.insertResource()` exists only as override.
- `@inspect` is opt-in resource metadata for frame-recorder snapshots. Components are tracked from registered component change ticks; resources record only when explicitly marked.
- No central manifest. Transformer injects side-effect registration calls (`rovy.__component`, `rovy.__system`, `rovy.__observer`, ...) right after each decorated class. `rovy.loadPaths(...)` force-requires module trees so those registrations run; must be called before `app.start()`. `app.start()` finalizes (allocates jecs IDs, wires hooks, sorts observers, auto-instantiates resources, fires `runOnStart`).
- Mutation must go through `commands.set` / `world.set` for change detection to fire.

## Open questions

Genuinely unresolved. Current preference noted; not final.

### System generics

`class Healer<T> implements ...` — transformer can't materialise stable ids for generic systems. Current preference: forbid generics on `@system`/`@monitor`/`@observer` classes in v1.

### Hot reload

Re-running a module's `rovy.__*` call should replace its prior registry entry and reset `lastRunTick`. Exact reload protocol undecided.

### `onChange` dedup

`@monitor` `onChange` fires per `set()` call. If two term components are `set()` in one step, it fires twice. Open: dedupe per step with a dirty flag, or leave as-is. Current preference: leave as-is, document it.

### StandardPlugin scope

Which schedules `StandardPlugin` ships (`Startup`/`PreUpdate`/`Update`/`PostUpdate`/`Cleanup`?) and whether `app.step()` order is configurable. Current preference: the five Bevy-like schedules, fixed order.

### ResMut write tracking

Whether `ResMut<T>` write intent is enforced (dev-mode freeze on `Res<T>`) or advisory-only for the future parallel scheduler. Current preference: advisory metadata only in v1.

## See also

- [Roadmap](/reference/roadmap.md)
- [Transformer](/runtime/transformer.md)
