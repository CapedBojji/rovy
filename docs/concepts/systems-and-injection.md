# Systems and Parameter Injection

> **Compile-time.** `@system`, `@set`, and all `Query<...>` param types are processed by the transformer at build time. It reads the decorator args and `run` param types via TypeScript `TypeChecker`, hoists pre-built query descriptors, and injects a `rovy.__system` registration call after the class. The `run` signature is the authoring surface — the runtime receives resolved handles, not the raw type annotations.

Systems are classes decorated with `@system`. The decorator carries scheduling config. The transformer reads param types on `run`, builds query descriptors, and injects a `rovy.__system` registration after the class. No manual `addSystems` calls.

## Sets

Sets are classes that extend `SystemSet`. `extends` is the type marker — TS enforces only `SystemSet` subclasses pass as `set:`. Optional `@set` decorator adds a debug label; not required.

```ts
abstract class SystemSet {
	static readonly label?: string;
}

// bare — label defaults to class name
class MovementSet extends SystemSet {}

// with debug label
@set({ label: "Movement" })
class CastingSet extends SystemSet {}
```

`configureSets` accepts the constructors in order:

```ts
app.configureSets(Update, [
	ClockSet,
	TargetingSet,
	MovementSet,
	CastingSet,
	StatusSet,
	DamageSet,
	DeathSet,
	CleanupSet,
]);
```

## Authoring

```ts
@system({ schedule: Update, set: MovementSet, after: [FaceTargets] })
class MoveUnits {
	run(
		commands: Commands,
		units: Query<[Position, Velocity], Without<Dead>>,
		clock: Res<BattleClock>,
	) {
		units.forEach((pos, vel) => {
			commands.set(
				units.entity,
				Position,
				new Position(pos.cell.add(vel.dir), pos.facingAngle),
			);
		});
	}
}
```

```ts
@system({ schedule: Update, set: StatusSet })
class ExpirePoison {
	run(
		commands: Commands,
		q: Query<[Entity, Poisoned], Changed<Poisoned>>,
		clock: Res<BattleClock>,
	) {
		q.forEach((entity, p) => {
			if (clock.tick >= p.expiresAtTick) {
				commands.remove(entity, Poisoned);
			}
		});
	}
}
```

```ts
@system({ schedule: Startup })
class SpawnInitialUnits {
	run(commands: Commands) {
		commands.spawn(new Position(Vector2.zero, 0), new Health(100, 100), Unit);
	}
}
```

## Decorator options

```ts
interface SystemOptions {
	schedule?: Schedule;            // default: Update
	set?: typeof SystemSet;         // which set — must extend SystemSet
	after?: SystemCtor[];           // run after these within the set
	before?: SystemCtor[];          // run before these within the set
	runIf?: () => boolean;          // skip system when returns false
}
```

`set` is typed as `typeof SystemSet` — passing a plain class that doesn't extend `SystemSet` is a TS error.

## Multiple queries

Declare as many `Query<...>` params as needed. Each is a separate pre-built jecs query handle injected independently.

```ts
@system({ schedule: Update, set: DamageSet })
class ProcessDamageEvents {
	run(
		commands: Commands,
		events: EventReader<DamageTaken>,
		units: Query<[Entity, Health], Without<Dead>>,
		shields: Query<[Entity, Shield]>,
		armors: Query<[Entity, Armor]>,
		clock: Res<BattleClock>,
	) {
		events.forEach((event) => {
			// each query iterated independently
		});
	}
}
```

No limit on query count per system or observer.

## Param types

The transformer reads the resolved TS type of each `run` param — no decorator needed on params.

| Param type | Injected value |
|------------|----------------|
| `Commands` | command buffer for this step |
| `Query<Terms, ...Filters>` | pre-built jecs query handle, tick-scoped for change detection |
| `Res<T>` | `world.resource(T)`, shallow-readonly, throws if missing |
| `ResMut<T>` | same, marks write intent for scheduler |
| `OptRes<T>` | `world.resource(T) \| undefined` |
| `EventReader<E>` | buffered events of type `E` for this step |
| `EventWriter<E>` | `send(event)` helper |
| `Local<T>` | per-system persistent state, initialised once |
| `World` | raw world access (escape hatch, bypasses tracking) |

The draft networking layer adds more injectable param types:

| Param type | Injected value |
|------------|----------------|
| `NetClient` | client-only outbound event handle |
| `NetServer` | server-only outbound event handle |
| `NetEventContext` | sender lookup for received client-to-server events |

Those net param types live in `@rovy/networking`. Core resolves them through package-provided external param ids, so core does not need net-specific descriptor kinds.

Planned prefab `build(...)` uses the same style of compile-time param lowering, but with a narrower allowed set. See [Prefabs](/concepts/prefabs.md).

## Collector injection

The injected surface also includes collectors for external signal translation:

```ts
@system({ schedule: Update })
class ConsumeFireRequests {
	run(fire: FireWeaponCollect, commands: Commands) {
		for (const request of fire.drain()) {
			// translate external payload into ECS work
		}
	}
}
```

Author collectors as `class FireWeaponCollect extends Collector<Payload>`. The queue inside the collector is the meaningful state; systems consume that queue through inherited `drain()`. Keep domain logic out of `drain()` itself.

If you need reusable outbound handles such as network clients/servers, prefer a `@resource`:

```ts
@system({ schedule: Update })
class SendSnapshots {
	run(network: Res<ServerNetworkState>) {
		network.events.worldSnapshot.broadcast(bytes);
	}
}
```

Collector instances are created once per `App` at `app.start()` and then injected by param type into systems, observers, and monitors. See [Collectors](/concepts/collectors.md).

The `@netEvent` design is different: network handles become first-class injected params provided by `@rovy/networking`, with boundary validation from the transformer and runtime. See [Networking](/packages/networking.md).

## Planned prefab injection

Prefabs are planned to reuse the same compile-time injection model, but on a `build(...)` method instead of a scheduled `run(...)` method:

```ts
@prefab
class SlimePrefab extends Prefab {
	build(commands: Commands, clock: Res<BattleClock>): Entity {
		const entity = this.entity();
		commands.insert(entity, Unit);
		commands.set(entity, SpawnTick, new SpawnTick(clock.tick));
		return entity;
	}
}
```

Design target:

- transformer reads `build(...)` param types and emits prefab param descriptors
- runtime resolves those params when the prefab is invoked as a bundle item
- prefab gets the runtime-selected target entity through the prefab base helper

Planned v1 exclusions are intentional: no `Query<...>`, no `EventReader<E>`, and no observer/monitor-only context params. Prefab authoring is for deterministic entity assembly, not schedule iteration.

## Query term types

Terms go in the first tuple position. Filters follow as additional type params.

```ts
Query<
	[Entity, Position, Optional<Target>],
	With<Unit>,
	Without<Dead>,
	Changed<Position>
>
```

| Term / Filter | Meaning |
|---------------|---------|
| `Entity` | bind entity id |
| `ComponentClass` | bind component instance |
| `Optional<C>` | bind `C \| undefined` |
| `Trait<T>` | bind one matching trait impl per row |
| `AllTraits<T>` | bind `T[]` for all impls on entity |
| `With<C>` | filter: must have C, no binding |
| `Without<C>` | filter: must not have C |
| `HasTrait<T>` | filter: must have any impl of T |
| `Changed<C>` | filter: C added or set since last run |
| `Added<C>` | filter: C added since last run |
| `Removed<C>` | filter: C removed since last run (binds `Entity` only) |

## Set ordering

Sets declared once in a plugin. Systems sorted within set by `after`/`before`.

```ts
@plugin
class BattlePlugin {
	build(app: App) {
		app.configureSets(Update, [
			ClockSet,
			TargetingSet,
			MovementSet,
			CastingSet,
			StatusSet,
			DamageSet,
			DeathSet,
			CleanupSet,
		]);
	}
}
```

## Boot — no manual addSystems

Transformer injects a `rovy.__system` call after each `@system` class:

```ts
class MoveUnits { run(...) {} }
rovy.__system(MoveUnits, {
	id: "src/systems/MoveUnits",
	schedule: Update,
	set: MovementSet,
	after: [FaceTargets],
	before: [],
	params: [
		{ kind: "commands" },
		{ kind: "query", handle: _q_MoveUnits_0 },
		{ kind: "res", ctor: BattleClock },
	],
});
```

App boot:

```ts
const app = new App();
app.addPlugin(BattlePlugin);
rovy.loadPaths("src/client/systems", "src/client/components");
app.start();
```

`rovy.loadPaths(...)` requires the modules so every injected `rovy.__system` runs; in TS authoring the args are string paths, and the transformer maps them to Roblox Instance roots before runtime. `app.start()` instantiates systems, sorts by `after`/`before`, and places them in their schedule/set. See [Compiled output](/runtime/compiled-output.md) and [Runtime lifecycle](/runtime/lifecycle.md).

## Execution per step

```ts
for (const set of schedule.sets) {
	for (const meta of set.systems) {
		const instance = instances.get(meta.ctor) ?? new meta.ctor();
		instances.set(meta.ctor, instance);

		if (meta.runIf && !meta.runIf()) continue;

		const args = meta.params.map((p) => resolveParam(p, world, commands, instance));
		instance.run(...args);
		meta.lastRunTick = world.changeTick;
	}
	world.flush();
}
world.changeTick += 1;
```

One instance per system class per App. Constructed once, reused every step.

## Local state

`Local<T>` survives across steps, isolated to one system:

```ts
@system({ schedule: Update, set: "Debug" })
class LogHealthChanges {
	run(
		q: Query<[Entity, Health], Changed<Health>>,
		local: Local<{ count: number }>,
	) {
		local.count ??= 0;
		q.forEach((entity, health) => {
			local.count += 1;
			print(`[${local.count}] entity ${entity} hp: ${health.current}`);
		});
	}
}
```

## Access analysis

Transformer scans `run` body for `commands.set(_, C, _)` / `commands.insert` / `commands.remove` calls and records the component classes as write targets. Combined with query term types, each system emits:

```ts
{
	reads: [Position, Velocity, BattleClock],
	writes: [Position],
	structuralWrites: [],
}
```

Single-threaded Roblox doesn't enforce access conflicts, but metadata is recorded for future parallel scheduling and dev-mode warnings.

## Open issues

- Generic system classes (`class Healer<T> extends ...`) — forbid in v1, transformer can't materialise stable ids.
- `runIf` referencing world state — needs world reference at schedule build time; may need lazy eval or resource-based condition helpers.
- Hot reload — re-running a module's `rovy.__system` should replace the prior registry entry and reset `lastRunTick`.

## See also

- [Queries](/concepts/queries.md)
- [Commands](/concepts/commands.md)
- [Change detection](/concepts/change-detection.md)
- [Transformer](/runtime/transformer.md)
- [Schedules](/concepts/schedules.md)
