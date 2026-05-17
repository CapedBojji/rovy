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

Planned prefab support extends the same bundle surface instead of adding a separate helper API:

```ts
commands.spawn(SlimePrefab);
commands.insert(entity, SlimePrefab);
world.spawn(SlimePrefab);
world.insert(entity, SlimePrefab);
```

In the planned v1 design, prefabs are singleton `@prefab` classes owned by the `App`. `commands.spawn(...)` reserves the entity id immediately, then flush invokes the prefab's `build(...)` against that exact target entity so deferred prefab usage stays deterministic.

Prefab authoring does not differentiate spawn vs insert. The prefab only receives the target entity to build into:

- `spawn` means runtime created or reserved the target entity first
- `insert` means runtime reused the provided target entity

So `commands.spawn(SlimePrefab, TeamEnemy, SpawnMarker)` means one entity gets:

- everything `SlimePrefab.build(...)` applies
- `TeamEnemy`
- `SpawnMarker`

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
- [Prefabs](24-prefabs.md)
- [Relationships](11-relationships.md)
- [Schedules](07-schedules.md)
