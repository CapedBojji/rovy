# Change Detection

How `Changed<C>`, `Added<C>`, `Removed<C>` query filters work in rovy on top of jecs.

## Background

jecs ships three component-level hooks:

| Hook | Fires when |
|------|------------|
| `on_add` | entity enters archetype containing `C` |
| `on_change` | `world:set(e, C, val)` mutates `C` in place |
| `on_remove` | entity leaves archetype containing `C` (remove or despawn) |

jecs has no built-in dirty bit or "changed-this-frame" query filter. Rovy builds one on top of the hooks.

## User-facing API

Filters are type params on a `Query<...>` system param:

```ts
@system({ schedule: Update, set: DamageSet })
class ReactToHealthChange {
	run(q: Query<[Entity, Health], Changed<Health>>) {
		q.forEach((entity, health) => {
			// only entities whose Health was set or just added since this system last ran
		});
	}
}

@system({ schedule: Update, set: StatusSet })
class ReactToPoison {
	run(q: Query<[Entity, Poisoned], Added<Poisoned>>) {
		q.forEach((entity, poisoned) => {
			// only entities that just gained Poisoned since this system last ran
		});
	}
}

@system({ schedule: Update, set: CleanupSet })
class ReactToStunRemoval {
	run(q: Query<[Entity], Removed<Stunned>>) {
		q.forEach((entity) => {
			// entities that lost Stunned since this system last ran
		});
	}
}
```

Bevy semantics: `added ⊆ changed`. A newly added component counts as changed.

### Filter vs monitor

`Removed<C>` (and `Changed<C>`) coexist with `@monitor` onExit / onChange — they are different tools:

| | Query filter | `@monitor` |
|--|--------------|------------|
| When it runs | when the owning system runs in its schedule | immediately on the jecs hook |
| Batching | drained as a set at system time | one callback per transition |
| Use for | "process everything that changed before I ran" | "react the instant it happens" |

## Loop semantics

Rovy keeps a monotonic `world.changeTick`. Each system/monitor stores its own `lastRunTick`.

`changeTick` is bumped once per **schedule run** — not per system, not per `app.step`. Every system within one schedule run observes the same tick, so two systems in different sets that both write `Health` produce one logical change tick for later `Changed<Health>` readers.

```txt
runSchedule(S):
  for each set in S:
    for each system in set:
      resolve params, run, system.lastRunTick = world.changeTick
    flush (apply commands + dispatch triggers/observers)
  world.changeTick += 1
```

Filter check: `changedTick > consumer.lastRunTick`. First run: `lastRunTick = -1` → all current state counts as changed (Bevy matches this).

## Internal storage

One map per registered component, keyed by entity id:

```ts
type ChangeStore = Map<Entity, number>;          // entity → tick of last add/change
const changeStores = new Map<ComponentCtor, ChangeStore>();

type RemovedRecord<T> = { entity: Entity; value: T; tick: number };
const removedBuffers = new Map<ComponentCtor, RemovedRecord<unknown>[]>();
```

## Hook wiring

When a component class is finalized at `app.start()` (from its `rovy.__component` registration), rovy installs three jecs listeners:

```ts
function registerChangeDetection<T extends object>(
	world: World,
	C: new (...args: never[]) => T,
	jecsId: jecs.Id<T>,
): void {
	const store: ChangeStore = new Map();
	const removed: RemovedRecord<T>[] = [];

	changeStores.set(C, store);
	removedBuffers.set(C, removed as RemovedRecord<unknown>[]);

	world.jecs.added(jecsId, (entity) => {
		store.set(entity, world.changeTick);
	});

	world.jecs.changed(jecsId, (entity) => {
		store.set(entity, world.changeTick);
	});

	world.jecs.removed(jecsId, (entity, _id, deleting) => {
		const value = world.jecs.get(entity, jecsId) as T | undefined;
		if (value !== undefined) {
			removed.push({ entity, value, tick: world.changeTick });
		}
		store.delete(entity);
	});
}
```

Notes:

- `on_remove` runs **before** the archetype transition, so `world.jecs.get(entity, jecsId)` still returns the outgoing value. Snapshot it; do not mutate.
- jecs warns `"on_remove must not perform structural changes"` — read only inside the hook.

## Filter evaluation

`Changed<C>`:

```ts
function changedFilter<T>(consumer: { lastRunTick: number }, C: ComponentCtor<T>) {
	const store = changeStores.get(C)!;
	return (entity: Entity) => {
		const t = store.get(entity);
		return t !== undefined && t > consumer.lastRunTick;
	};
}
```

`Added<C>` differs only by source — a separate `addedTick` store fed only by `on_add`, not `on_change`.

`Removed<C>` drains the removed buffer; the row binds `entity` only (the component is gone):

```ts
function* drainRemoved<T>(consumer: { lastRunTick: number }, C: ComponentCtor<T>) {
	const buf = removedBuffers.get(C) as RemovedRecord<T>[];
	for (const rec of buf) {
		if (rec.tick > consumer.lastRunTick) {
			yield rec.entity;
		}
	}
}
```

Buffer is shared across consumers. Prune entries with `tick <= min(lastRunTick across all consumers)` at schedule-run boundary.

## Archetype prefilter ordering

`Query<[Health], With<Unit>, Without<Dead>, Changed<Health>>` evaluates:

1. Archetype prefilter (jecs base query: `Health + Unit - Dead`).
2. Row visit.
3. `Changed<Health>` tick check.
4. Bind values and emit.

`Removed<C>` skips step 1 for `C` (entity no longer in that archetype) — it iterates the drained buffer instead.

## Mutation must go through `commands.set` / `world.set`

Direct field mutation bypasses jecs entirely:

```ts
const health = world.get(entity, Health);
health.current -= 10; // ❌ no on_change fires, Changed<Health> misses this
```

Required:

```ts
commands.set(entity, Health, new Health(health.current - 10, health.max));
```

Could enforce via `Object.freeze` on returned instances in dev builds; skip in release.

## Pair / relationship terms

If `C` is a jecs pair, register listeners on the relation id and filter inside the callback by exact pair id, or accept any when target is `jecs.Wildcard`:

```ts
world.jecs.added(rel, (entity, id) => {
	if (wildcard || id === pairId) {
		store.set(entity, world.changeTick);
	}
});
```

## Cost model

- `world:set` → one map write per registered component. O(1).
- `Changed<C>` filter → one map lookup per archetype row. O(1) per row.
- Map size = entities that ever touched `C` and are still alive with it. Cleared on remove.

Acceptable for most use cases. Revisit only if profiling complains.

## Edge cases

- **Insert overwrites existing**: `commands.insert(e, new Health(...))` on an entity already holding `Health` — jecs fires `on_change` if pre-existing, `on_add` if new. Both feed the store; identical from `Changed` perspective.
- **Despawn**: `on_remove` fires per component before the entity is freed. `deleting` flag true. Removed buffer captures values.
- **Same tick double-write**: two writes within one schedule run produce one tick stamp. Consumers see one change. Bevy matches this.
- **Consumer never ran**: `lastRunTick = -1` → all current state counts as changed on first run.

## See also

- [Queries](/concepts/queries.md)
- [Commands](/concepts/commands.md)
- [Monitors](/concepts/monitors.md)
- [Schedules](/concepts/schedules.md)
