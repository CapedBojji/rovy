# Public API Reference

Draft. Type signatures still pending — see [Roadmap](17-roadmap.md).

## App

```ts
new App();
app.addPlugin(plugin);
app.addMetadata(EcsMetadata);

app.insertResource(resourceInstance);

app.addSystems(schedule, systems);
app.configureSets(schedule, sets);

app.addObserver(EventClass, callback, options?);

app.onAdd(ComponentClass, callback);
app.onInsert(ComponentClass, callback);
app.onChange(ComponentClass, callback);
app.onRemove(ComponentClass, callback);
app.onDespawn(callback);

app.onAddTrait<Trait>(callback);
app.onChangeTrait<Trait>(callback);
app.onRemoveTrait<Trait>(callback);

app.start();
app.step(dt?);
app.update(dt);
app.flush();
```

## World

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

world.trigger(eventInstance);
world.readEvents(EventClass);

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
```

## Query

```ts
query(...terms);
optional(ComponentClass);
trait<Trait>();
allTraits<Trait>();
hasTrait<Trait>();
```

Chainable filters:

```ts
.with(C)
.without(C)
.changed(C)
.added(C)
```

Terminal:

```ts
.forEach(world, (..bindings) => {});
```

## Wrappers

```ts
system(fn);
observer(EventClass, fn);
plugin(fn);
```

## See also

- [Queries](03-queries.md)
- [Commands](04-commands.md)
- [Observers](06-observers.md)
- [Schedules](07-schedules.md)
