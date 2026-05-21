# Prefabs

> **Planned surface.** This page describes the current prefab design target. It is documentation for the planned `@prefab` feature, not shipped runtime behavior yet.

Prefabs are reusable entity builders that fit into the same bundle-oriented API as components and tags.

Goal:

- keep entity construction in normal ECS authoring code
- allow shared spawn recipes without inventing a separate manifest format
- support both immediate `world.*` construction and deferred `commands.*` construction
- reuse the existing compile-time injection model instead of a manual helper API

## Authoring shape

Planned v1 authoring:

```ts
@prefab
class SlimePrefab extends Prefab {
	build(commands: Commands, clock: Res<BattleClock>): Entity {
		const entity = this.entity();
		commands.insert(entity, Unit);
		commands.set(entity, Health, new Health(100, 100));
		commands.set(entity, SpawnTick, new SpawnTick(clock.tick));
		return entity;
	}
}
```

Important v1 constraints:

- prefab classes are app-owned singletons, similar to collectors
- prefab classes must be zero-arg/default-constructible
- prefabs are static in v1: no per-spawn payload, no constructor state
- `build(...)` must return the target entity the runtime selected

## Why singleton prefabs

The current design intentionally mirrors collector ergonomics:

- transformer marks the class at compile time
- `app.start()` instantiates one prefab instance per `@prefab` class
- runtime injects `build(...)` params from descriptor metadata
- authored code uses the prefab class as a bundle item

That keeps prefab behavior aligned with the rest of Rovy's registration/finalize/run model instead of introducing ad-hoc runtime factories.

## Target entity helper

Prefab `build(...)` needs a stable target entity so the same authoring surface works for all four entry points:

- `world.spawn(PrefabClass)`
- `world.insert(entity, PrefabClass)`
- `commands.spawn(PrefabClass)`
- `commands.insert(entity, PrefabClass)`

Because of that, the planned base type exposes a helper like:

```ts
abstract class Prefab {
	protected entity(): Entity;
}
```

`this.entity()` returns the runtime-selected target entity for the current build call. That target is:

- a freshly created entity for `world.spawn(...)`
- the provided entity for `world.insert(...)`
- the reserved entity id for `commands.spawn(...)`
- the provided entity for `commands.insert(...)`

The important rule is that prefab authoring does **not** branch on spawn vs insert. The prefab only sees "build into this target entity". From inside `build(...)`, both call paths look the same:

- `spawn` means runtime created a new target entity first
- `insert` means runtime reused an existing target entity

So prefab code should be target-oriented, not call-site-oriented.

## Supported `build(...)` injection in v1

Planned supported param types:

- `Commands`
- `World`
- `Res<T>`
- `ResMut<T>`
- `OptRes<T>`
- `@collect` classes
- external package params
- `EventWriter<E>`

Planned exclusions in v1:

- `Query<...>`
- `EventReader<E>`
- observer-only `event`
- monitor-only `entity`
- monitor-only `term`
- `Local<T>`

The idea is that prefab building should be about deterministic entity assembly, not schedule-scoped querying or observer/monitor context.

## Bundle behavior

Prefabs are planned as bundle items, not as a separate spawn API:

```ts
commands.spawn(SlimePrefab);
commands.spawn(SlimePrefab, TeamEnemy, SpawnMarker);

const entity = world.spawn(SlimePrefab);
world.insert(entity, SlimePrefab);
```

Bundle evaluation rules in the planned design:

- non-prefab items keep their current component/tag behavior
- prefab detection happens before normal bundle classification
- prefab build runs against a known target entity
- extra bundle items apply to that same target entity
- nested prefab calls should restore target context safely

Example:

```ts
commands.spawn(SlimePrefab, TeamEnemy, SpawnMarker);
```

planned result:

- runtime reserves one new entity
- `SlimePrefab.build(...)` builds into that entity
- `TeamEnemy` and `SpawnMarker` are also applied to that same entity

Likewise:

```ts
commands.insert(entity, SlimePrefab);
```

planned result:

- runtime does not create a new entity
- `SlimePrefab.build(...)` builds into the provided `entity`

## Deferred command behavior

The main reason prefab needs explicit design is `commands.spawn(...)`.

Planned runtime behavior:

1. `commands.spawn(PrefabClass)` reserves an entity id immediately
2. the queued command remembers both the prefab class and that reserved entity
3. flush invokes prefab `build(...)` against the reserved entity
4. prefab returns that same entity

This keeps deferred prefab construction compatible with:

- later commands in the same tick that reference the reserved entity
- deterministic flush order
- the normal command-buffer mental model

If `build(...)` returns a different entity than the target entity, runtime should fail loudly.

## Compiled and runtime shape

Planned transformer lowering:

```ts
@prefab
class SlimePrefab extends Prefab {
	build(commands: Commands, clock: Res<BattleClock>): Entity { ... }
}
```

Conceptually lowers to:

```luau
local SlimePrefab = {}
SlimePrefab.__index = SlimePrefab
function SlimePrefab.new()
    return setmetatable(Prefab.new(), SlimePrefab)
end

function SlimePrefab:build(commands, clock)
    ...
end

rovy.__prefab(SlimePrefab, {
    id = "src/prefabs/SlimePrefab",
    params = {
        { kind = "commands" },
        { kind = "res", ctor = BattleClock },
    },
})
```

At finalize, `app.start()` instantiates the prefab once and stores it like other app-owned singleton authoring constructs.

## Relationship to other Rovy features

- Use a prefab when you want a reusable entity-construction recipe.
- Use a collector when you want to translate external Roblox/Flamework signals into ECS work.
- Use a system when you want scheduled gameplay logic.
- Use a resource when you want shared mutable runtime state.

Prefabs are construction sugar over the existing world/commands surfaces, not a new scheduler concept.

## See also

- [Commands](/concepts/commands.md)
- [Public API Reference](/reference/api.md)
- [Systems and Parameter Injection](/concepts/systems-and-injection.md)
- [Compiled Output](/runtime/compiled-output.md)
- [Runtime Lifecycle](/runtime/lifecycle.md)
