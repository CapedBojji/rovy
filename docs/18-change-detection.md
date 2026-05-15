# Change Detection

How `.changed(C)`, `.added(C)`, `.removed(C)` work in rovy on top of jecs.

## Background

jecs ships three component-level hooks:

| Hook | Fires when |
|------|------------|
| `on_add` | entity enters archetype containing `C` |
| `on_change` | `world:set(e, C, val)` mutates `C` in place |
| `on_remove` | entity leaves archetype containing `C` (remove or despawn) |

jecs has no built-in dirty bit or "changed-this-frame" query filter. Rovy builds one on top of the hooks.

## User-facing API

Same as the spec — query filters, identical between TS and runtime:

```ts
query(Entity, Health)
	.changed(Health)
	.forEach(world, (entity, health) => {
		// only entities whose Health was set or just added since this system last ran
	});

query(Entity, Poisoned)
	.added(Poisoned)
	.forEach(world, (entity, poisoned) => {
		// only entities that just gained Poisoned since this system last ran
	});

query(Entity)
	.removed(Stunned)
	.forEach(world, (entity) => {
		// only entities that lost Stunned since this system last ran
	});
```

Bevy semantics: `added ⊂ changed`. A newly added component counts as changed.

## Loop semantics

Rovy keeps a monotonic `world.changeTick: number`. Each system stores its own `lastRunTick`.

Per step:

```txt
for each system in schedule:
  system.run(world, commands)
  system.lastRunTick = world.changeTick
flush
world.changeTick += 1
```

Inside a system, a query filter compares per-(entity, component) `lastChangedTick` against `system.lastRunTick`:

```ts
if (changedTick > system.lastRunTick) emit row;
```

Wraparound at `2^53` — ignore for game runtime.

## Internal storage

One map per registered component, keyed by entity id:

```ts
type ChangeStore = Map<Entity, number>; // entity → tick of last add/change
const changeStores = new Map<ComponentCtor, ChangeStore>();

type RemovedRecord<T> = { entity: Entity; value: T; tick: number };
const removedBuffers = new Map<ComponentCtor, RemovedRecord<unknown>[]>();
```

## Hook wiring

When a component class is registered (via metadata manifest), rovy installs three jecs listeners:

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

- The `on_remove` callback runs **before** the archetype transition, so `world.jecs.get(entity, jecsId)` still returns the outgoing value. Snapshot it; do not mutate.
- jecs warns `"on_remove must not perform structural changes"` — read only inside the hook.

## Query-time filter

Pseudo for `.changed(C)`:

```ts
function changedFilter<T>(
	world: World,
	system: SystemMeta,
	C: ComponentCtor<T>,
): (entity: Entity) => boolean {
	const store = changeStores.get(C)!;
	return (entity) => {
		const t = store.get(entity);
		return t !== undefined && t > system.lastRunTick;
	};
}
```

`.added(C)` differs only by source: a separate `addedTick` store fed only by `on_add` (not `on_change`). If you want the simpler "added ⊆ changed" model, reuse the same store and don't expose `added` separately — Bevy does this.

`.removed(C)` drains the removed buffer:

```ts
function* drainRemoved<T>(
	system: SystemMeta,
	C: ComponentCtor<T>,
): IterableIterator<{ entity: Entity; value: T }> {
	const buf = removedBuffers.get(C) as RemovedRecord<T>[];
	for (const rec of buf) {
		if (rec.tick > system.lastRunTick) {
			yield { entity: rec.entity, value: rec.value };
		}
	}
}
```

Buffer is shared, so multiple systems can read it. Garbage collection: prune entries with `tick <= min(lastRunTick across systems)` at step boundary.

## Full per-step loop

```ts
class App {
	step(dt?: number): void {
		for (const schedule of this.schedules) {
			for (const set of schedule.sets) {
				for (const sys of set.systems) {
					sys.run(this.world, this.world.commands);
					sys.lastRunTick = this.world.changeTick;
				}
				this.world.flush(); // apply commands + observers
			}
		}
		this.pruneRemovedBuffers();
		this.world.changeTick += 1;
	}
}
```

Why bump tick **after** the step, not per system: every system within the same step observes the same `changeTick`. Two systems in the same set that both write `Health` produce one logical "change tick" for downstream `.changed(Health)` readers in later sets.

## Mutation must go through `commands.set` / `world.set`

Direct field mutation bypasses jecs entirely:

```ts
const health = world.get(entity, Health);
health.current -= 10; // ❌ no on_change fires, .changed(Health) misses this
```

Required:

```ts
commands.set(entity, Health, new Health(health.current - 10, health.max));
```

Document this loudly. Could enforce via `Object.freeze` on returned instances in dev builds; skip in release.

## Multi-component sets — `with` / `without`

Filter chain is AND:

```ts
query(Entity, Health)
	.with(Unit)
	.without(Dead)
	.changed(Health)
	.forEach(world, ...);
```

Order of evaluation inside the runtime:

1. Archetype prefilter (jecs base query: `Health + Unit - Dead`).
2. Row visit.
3. `.changed(Health)` tick check.
4. Bind values and emit.

## Pair / relationship terms

If `C` is a jecs pair (`jecs.pair(Rel, Tgt)`), register listeners on `Rel` and filter inside the callback by exact pair id, or accept any when target is `jecs.Wildcard`. Mirrors the jecs-utils observer wiring:

```ts
world.jecs.added(rel, (entity, id) => {
	if (wildcard || id === pairId) {
		store.set(entity, world.changeTick);
	}
});
```

## Cost model

- `world:set` → one map write per registered component. O(1).
- `.changed(C)` filter → one map lookup per archetype row. O(1) per row.
- Map size = entities that ever touched `C` and are still alive with it. Cleared on remove.

Acceptable for the battle sim. Revisit only if profiling complains.

## Edge cases

- **Insert overwrites existing**: `commands.insert(e, new Health(...))` on entity already holding `Health` — jecs calls `on_change` if pre-existing, `on_add` if new. Both feed the same store; result is identical from `.changed` perspective.
- **Despawn**: `on_remove` fires per component before entity is freed. `deleting` flag is true. Removed buffer captures values.
- **Same tick double-write**: two writes within one step produce one tick stamp. Consumers see one "changed" event regardless of write count. Bevy matches this.
- **System never ran**: `lastRunTick = -1` initially → all current state counts as changed on first run. Bevy matches this.

## See also

- [Queries](03-queries.md)
- [Commands](04-commands.md)
- [Observers](06-observers.md)
- [Schedules](07-schedules.md)
