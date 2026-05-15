# Commands

Commands are deferred world mutations. Systems should usually mutate through `commands`, not directly through `world`.

## Why deferred

Direct mutation inside a query iteration invalidates jecs archetype layout. Commands queue the change and apply it at the next flush point.

## Example

```ts
const expirePoisonSystem = system((world, commands) => {
	const clock = world.resource(BattleClock);

	query(Entity, Poisoned).forEach(world, (entity, poisoned) => {
		if (clock.tick >= poisoned.expiresAtTick) {
			commands.remove(entity, Poisoned);
		}
	});
});
```

## API

```ts
commands.spawn(...bundle);
commands.despawn(entity);

commands.insert(entity, componentOrTag);
commands.set(entity, ComponentClass, value);
commands.remove(entity, ComponentClass);

commands.send(event);
commands.trigger(event);
```

## Direct world access

Available but rare. Use during startup, tests, or when you need the entity id back immediately.

```ts
world.spawn(...bundle);
world.insert(entity, componentOrTag);
world.set(entity, ComponentClass, value);
world.remove(entity, ComponentClass);
```

## See also

- [Events](05-events.md)
- [Flush semantics](07-schedules.md)
