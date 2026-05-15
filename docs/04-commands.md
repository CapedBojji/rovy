# Commands

Commands are deferred world mutations. Systems, observers, and monitors mutate through `commands`, not directly through `world`.

## Why deferred

Direct mutation inside a query iteration invalidates jecs archetype layout. Commands queue the change and apply it at the next flush point (set boundary).

## Example

```ts
@system({ schedule: Update, set: StatusSet })
class ExpirePoison {
	run(
		commands: Commands,
		q: Query<[Entity, Poisoned]>,
		clock: Res<BattleClock>,
	) {
		q.forEach((entity, poisoned) => {
			if (clock.tick >= poisoned.expiresAtTick) {
				commands.remove(entity, Poisoned);
			}
		});
	}
}
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

commands.relate(source, RelationClass, target);
commands.unrelate(source, RelationClass, target);

commands.runSchedule(ScheduleClass);
```

## Direct world access

Available but rare. Use during startup, tests, or when you need the entity id back immediately.

```ts
world.spawn(...bundle);
world.despawn(entity);

world.insert(entity, componentOrTag);
world.set(entity, ComponentClass, value);
world.remove(entity, ComponentClass);

world.relate(source, RelationClass, target);
world.unrelate(source, RelationClass, target);

world.trigger(eventInstance);   // immediate observer dispatch
world.runSchedule(ScheduleClass);
```

`commands.set` / `world.set` is mandatory for mutation — direct field writes bypass jecs hooks and break change detection. See [Change detection](16-change-detection.md#mutation-must-go-through-commandsset--worldset).

## See also

- [Events](05-events.md)
- [Relationships](11-relationships.md)
- [Schedules](07-schedules.md)
