# Transformer

The roblox-ts transformer handles compile-time work that runtime TypeScript cannot do: resolving generic types, validating decorator usage, hoisting query descriptors, and injecting `rovy.__*` registration calls after each decorated class.

Shipped as the `rovy-transformer` package — a dev-only roblox-ts plugin, separate from the `@rovy/core` runtime. See [Packages](21-packages.md) for the split and `tsconfig.json` setup.

## Responsibilities

All of the following happen at **build time**. Nothing below runs at Luau startup.

1. Scan every decorated class: `@component`, `@resource`, `@event`, `@system`, `@observer`, `@monitor`, `@relation`, `@schedule`, `@set`, `@plugin`.
2. Resolve trait macros (`trait<T>()`) and query macros (`query<...>()`), plus `Trait<T>` / `HasTrait<T>` / `AllTraits<T>` type references, via TypeScript `TypeChecker` (erased at runtime — must happen now).
3. Generate stable trait IDs from canonical module paths.
4. Scan `implements` clauses on `@component` classes to find trait implementers.
5. Read `run` / `onEnter` / `onExit` / `onChange` param types — extract `Query<...>` descriptors, resource deps, event readers/writers.
6. Validate `@observer` field exclusivity (`event` only) and `@monitor` param order against the match query terms.
7. Hoist `Query<...>` descriptors and `query<...>()` macros to module-level constants (pre-built jecs query handles).
8. Inject a `rovy.__*` registration call right after each decorated class declaration.

## Inference boundary

Do not structurally infer trait implementations from method names. Only `implements` clauses on `@component` classes count.

Counts:

```ts
@component
class Stunned implements CrowdControl {}
```

Does not count automatically:

```ts
@component
class SomeClass {
	blocksMovement() {
		return true;
	}
}
```

## Registration injection

No central manifest. The transformer injects a `rovy.__*` registration call directly after each decorated class. These run as **module side effects** when the module is required.

Source:

```ts
@component
class Position {
	constructor(public cell: Vector2, public facingAngle: number) {}
}

@system({ schedule: Update, set: MovementSet, after: [FaceTargets] })
class MoveUnits {
	run(commands: Commands, units: Query<[Entity, Position], Without<Dead>>) { ... }
}
```

Emitted (conceptual):

```ts
class Position { ... }
rovy.__component(Position, "src/components/Position");

const _q_MoveUnits_0 = rovy.__query("src/systems/MoveUnits:0", [Position], { without: [Dead] });
class MoveUnits { ... }
rovy.__system(MoveUnits, {
	id: "src/systems/MoveUnits",
	schedule: Update,
	set: MovementSet,
	after: [FaceTargets],
	before: [],
	params: [
		{ kind: "commands" },
		{ kind: "query", handle: _q_MoveUnits_0 },
	],
});
```

One injected call per decorator:

| Decorator | Injected call |
|-----------|---------------|
| `@component` | `rovy.__component(C, id)` |
| `@resource` | `rovy.__resource(C, id)` — finalize auto-instantiates via default ctor |
| `@event` | `rovy.__event(C, { capacity })` |
| `@system` | `rovy.__system(C, { schedule, set, after, before, params })` |
| `@observer` | `rovy.__observer(C, { event, priority, params })` |
| `@monitor` | `rovy.__monitor(C, { match, params })` |
| `@relation` | `rovy.__relation(C, { exclusive, onTargetDelete, onDelete })` |
| `@schedule` | `rovy.__schedule(C, { runOnStart })` |
| `implements Trait` on `@component` | `rovy.__traitImpl("src/traits/CrowdControl", C)` |

Each `rovy.__*` call only **pushes into a global registry**. No jecs IDs, no hooks yet — registration is lazy. `app.start()` does the finalize pass.

## Module loading

Roblox ModuleScripts do not run unless required. A self-registering module is silently absent if no game code requires it.

`rovy.loadPaths(...)` solves this — at runtime it recursively requires every `ModuleScript` under the given instances, so every injected `rovy.__*` side effect runs.

```ts
rovy.loadPaths(
	script.Parent.components,
	script.Parent.systems,
	script.Parent.observers,
);

app.start();   // finalize: allocate jecs IDs, wire hooks, sort observers, fire runOnStart
```

`rovy.loadPaths(...)` must be called before `app.start()`. Calling `start()` with empty registries is a no-op error.

## Stable IDs

Do not use bare names:

```ts
__ecs.trait("CrowdControl")
```

Use fully-qualified module paths:

```ts
__ecs.trait("src/shared/battle/traits/CrowdControl")
```

Reason: avoid collisions across files that happen to share a type name. Same rule for hoisted query descriptors and monitor match tokens.

## See also

- [Trait runtime](09-trait-runtime.md)
- [Systems and injection](17-systems-and-injection.md)
- [Monitors](18-monitors.md)
