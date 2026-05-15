# Public API Reference

Full public surface. Authoring is decorator-based; the transformer reads decorators and `run`/`onEnter`/`onExit`/`onChange` param types and injects `rovy.__*` registration calls. `rovy.loadPaths(...)` runs them; `app.start()` finalizes.

## Decorators

```ts
@component
@resource
@event(options?: { capacity?: number; label?: string })
@system(options: { schedule: ScheduleCtor; set?: typeof SystemSet; after?: SystemCtor[]; before?: SystemCtor[]; runIf?: () => boolean })
@observer(options: { event: EventCtor; priority?: number })
@monitor(options: { match: QueryToken })
@relation(options?: { exclusive?: boolean; onTargetDelete?: "cascade" | "remove" | "none"; onDelete?: "cascade" | "remove" | "none" })
@schedule(options?: { runOnStart?: boolean })
@set(options?: { label?: string })   // optional, on classes extending SystemSet
@plugin                              // on a class with build(app: App)
```

## Injection params

Available in `run` (systems/observers) and `onEnter`/`onExit`/`onChange` (monitors):

| Param type | Injected value |
|------------|----------------|
| Event class (observer first param) | the event instance |
| `Entity` | matched entity (monitors, query rows) |
| `Commands` | command buffer |
| `Query<[Terms], ...Filters>` | pre-built query handle |
| `Res<T>` | read-only resource (throws if missing) |
| `ResMut<T>` | mutable resource (write intent) |
| `OptRes<T>` | `T \| undefined` |
| `EventReader<E>` | buffered events of `E` this run |
| `EventWriter<E>` | typed `send` handle for `E` |
| `Local<T>` | per-instance persistent state |
| `World` | raw world (escape hatch) |

## rovy (global registry)

Decorators inject these — you call only `loadPaths`.

```ts
rovy.loadPaths(...instances);   // recursively require module trees → side effects run
rovy.traitToken<T>();           // value-position trait handle (see Traits)
// rovy.__component / __resource / __event / __system / __observer
// / __monitor / __relation / __schedule / __traitImpl / __query
//   are transformer-injected — never hand-written
```

## App

```ts
new App();
app.addPlugin(PluginClass);

app.insertResource(resourceInstance);   // override auto-registered default
app.configureSets(ScheduleCtor, [SetClass, ...]);

app.start();                 // finalize registries + fire @schedule({ runOnStart: true })
app.flush();                 // manual flush escape hatch
```

No `addMetadata` / `addSystems` / `addObserver` / `onAdd*` / `step`. Systems/observers/monitors self-register via transformer-injected `rovy.__*` calls; `rovy.loadPaths(...)` must run before `app.start()`. Resources auto-register from `@resource` defaults — `insertResource` only needed to override. `app.step()` lives in the optional `StandardPlugin` (see [Schedules](07-schedules.md#standardplugin-optional)).

## World

Escape hatch — prefer `commands` and injection.

```ts
world.spawn(...bundle);
world.despawn(entity);

world.insert(entity, componentOrTag);
world.set(entity, ComponentClass, value);
world.remove(entity, ComponentClass);

world.has(entity, ComponentClass);
world.get(entity, ComponentClass);
world.resource(ResourceClass);
world.insertResource(resourceInstance);

world.relate(source, RelationClass, target);
world.unrelate(source, RelationClass, target);
world.hasRelation(source, RelationClass, target);
world.getRelation(source, RelationClass, target);

world.trigger(eventInstance);     // immediate observer dispatch
world.runSchedule(ScheduleClass);
world.flush();
```

## Commands

```ts
commands.spawn(...bundle);
commands.despawn(entity);

commands.insert(entity, componentOrTag);
commands.set(entity, ComponentClass, value);
commands.remove(entity, ComponentClass);

commands.send(eventInstance);
commands.trigger(eventInstance);

commands.relate(source, RelationClass, target);
commands.unrelate(source, RelationClass, target);

commands.runSchedule(ScheduleClass);
```

## Query types

Param type — `Query<[Terms], ...Filters>`.

Terms (bind a value):

```ts
Entity
ComponentClass
Optional<C>      // C | undefined
Trait<T>         // one row per matching impl
AllTraits<T>     // T[] per entity
Pair<R>          // { target: Entity, data?: R }
```

Filters (no binding):

```ts
With<C>
Without<C>
HasTrait<T>
HasPair<R>
Changed<C>
Added<C>
Removed<C>
```

Query handle:

```ts
q.forEach((..bindings) => {});
q.size();
q.first();
for (const [..bindings] of q) {}
q.withTarget(entity);   // narrow Pair<R> to specific target
```

## Macros

Compile-time only — transformer rewrites them.

```ts
trait<T>();              // value position (decorator args, etc.)
query<[Terms], ...F>();  // @monitor match
```

## Wrappers

Decorators replace the old functional wrappers. There is no `system(fn)`, `observer(fn)`, or `plugin(fn)`. Use `@system`, `@observer`, `@monitor`, `@plugin` classes.

## See also

- [Queries](03-queries.md)
- [Commands](04-commands.md)
- [Observers](06-observers.md)
- [Monitors](18-monitors.md)
- [Systems and injection](17-systems-and-injection.md)
