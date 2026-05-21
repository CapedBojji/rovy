# Transformer

The roblox-ts transformer handles compile-time work that runtime TypeScript cannot do: resolving generic types, validating decorator usage, hoisting query descriptors, injecting `rovy.__*` registration calls after each decorated class, and lowering widget authoring for `@rovy/ui`.

Shipped as the `rovy-transformer` package — a dev-only roblox-ts plugin, separate from the `@rovy/core` runtime. See [Packages](/packages/packages.md) for the split and `.rovy.json`-driven setup.

## Responsibilities

All of the following happen at **build time**. Nothing below runs at Luau startup.

1. Scan every decorated class: `@component`, `@collect`, `@resource`, `@event`, `@system`, `@observer`, `@monitor`, `@relation`, `@schedule`, `@set`, `@plugin`.
2. Resolve trait macros (`trait<T>()`) and query macros (`query<...>()`), plus `Trait<T>` / `HasTrait<T>` / `AllTraits<T>` type references, via TypeScript `TypeChecker` (erased at runtime — must happen now).
3. Generate stable trait IDs from canonical module paths.
4. Scan `implements` clauses on `@component` classes to find trait implementers.
5. Read `run` / `onEnter` / `onExit` / `onChange` param types — extract `Query<...>` descriptors, collector deps, resource deps, event readers/writers.
6. Validate `@observer` field exclusivity (`event` only) and `@monitor` param order against the match query terms.
7. Hoist `Query<...>` descriptors and `query<...>()` macros to module-level constants (pre-built jecs query handles).
8. Inject a `rovy.__*` registration call right after each decorated class declaration.

The networking layer adds more transformer duties: detect `@netEvent` from `@rovy/networking`, treat it as implicit core `@event`, read network settings from `.rovy.json`, generate Blink-validated `.blink` schema metadata, lower `NetClient`/`NetServer` params through core's package-extension injection hook, and inject `rovyNet.__netEvent(...)` metadata. See [Networking](/packages/networking.md).

UI work adds another compile-time path: detect JSDoc `@widget` functions, require a same-file implementation, inject widget registration metadata, wrap the function through `RovyUi.__widget(...)`, lower later plain widget calls and built-in `@rovy/ui` widget calls through `RovyUi.__callWidget(widget, "module:key", [args])`, erase leading `style: Style` authoring sugar into `RovyUi.getActiveStyle()`, lower storage helpers like `useState` / `useEffect` / `useInstance` to keyed internals, and lower `StyleScope(...)` / `scope(...)` as keyed callback-bounded runtime scopes. See [UI](/packages/ui.md).

## Transformer config

Do not keep active environment or Rojo selection in `tsconfig.json`.

`tsconfig.json` should only register the transformer and point it at `.rovy.json`:

```json
{
	"compilerOptions": {
		"plugins": [
			{
				"transform": "rovy-transformer",
				"config": ".rovy.json"
			}
		]
	}
}
```

`.rovy.json` is the source of truth for:

- active environment selection
- Rojo project path
- optional sourcemap path
- explicit client/server/shared boundaries
- net settings such as transport choice, remote scope, polling, and strict boundary checks
- generated Blink transport artifacts

Example:

```json
{
	"$schema": "./node_modules/@rovy/core/schema/rovy.schema.json",
	"current": "dev",
	"environments": {
		"dev": {
			"rojo": "default.project.json",
			"sourcemap": "sourcemap.json",
			"boundaries": {
				"server": ["src/server"],
				"client": ["src/client"],
				"shared": ["src/shared"]
			},
			"net": {
				"strictBoundaryChecks": true,
				"transport": "blink",
				"blink": {
					"enabled": true,
					"remoteScope": "ROVY",
					"manualReplication": true,
					"usePolling": true
				}
			}
		}
	}
}
```

Environment resolution order:

1. `process.env.ROVY_ENV`
2. `.rovy.json` `current`
3. transformer default

When `net.transport` is `"blink"` (the default), the transformer owns Blink generation. It writes backend artifacts to:

- `out/shared/net/generated/rovy.generated.blink`
- `out/shared/net/generated/RovyBlinkClient.luau`
- `out/shared/net/generated/RovyBlinkServer.luau`
- `out/shared/net/generated/RovyBlinkTypes.luau`

These are generated build outputs, not user-authored source files.

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
| `@collect` | `rovy.__collect(C, id)` — runtime instantiates once per `App` |
| `@resource` | `rovy.__resource(C, id)` — finalize auto-instantiates via default ctor |
| `@event` | `rovy.__event(C, { capacity })` |
| `@system` | `rovy.__system(C, { schedule, set, after, before, params })` |
| `@observer` | `rovy.__observer(C, { event, priority, params })` |
| `@monitor` | `rovy.__monitor(C, { match, params })` |
| `@relation` | `rovy.__relation(C, { exclusive, onTargetDelete, onDelete })` |
| `@schedule` | `rovy.__schedule(C, { runOnStart })` |
| `implements Trait` on `@component` | `rovy.__traitImpl("src/traits/CrowdControl", C)` |

Each `rovy.__*` call only **pushes into a global registry**. No jecs IDs, no hooks yet — registration is lazy. `app.start()` does the finalize pass.

## Widget lowering

Widgets are not public classes. The intended authoring shape is one JSDoc-tagged function:

```ts
/** @widget */
export function Window(style: Style, props: { title: string }): void {
	print(style.windowBgColor, props.title);
}

Window({ title: "Inventory" });
```

The transformer is expected to:

1. detect JSDoc `@widget` on the function declaration
2. require a same-file implementation for the tagged function
3. detect a leading `style: Style` param as special widget authoring sugar
4. inject widget registration metadata as a module side effect
5. wrap the function through `RovyUi.__widget(...)`
6. lower later `Window(args)` callsites through `RovyUi.__callWidget(...)` with a stable callsite key
7. erase the runtime `style` param and insert `const style = RovyUi.getActiveStyle()` at the start of the lowered body
8. lower `StyleScope({ patch, discriminator? }, fn)` as callback-bounded runtime style scope

Conceptually:

```ts
/** @widget */
export function Window(style: Style, props: { title: string }): void {
	print(style.windowBgColor, props.title);
}

const Window = RovyUi.__widget(function Window(props: { title: string }): void {
	const style = RovyUi.getActiveStyle();
	print(style.windowBgColor, props.title);
}, {
	id: "src/ui/Window@Window",
	name: "Window",
});

RovyUi.__callWidget(Window, "src/ui/Window:0", [{ title: "Inventory" }]);
```

The public authoring stays `Window({ ... })`; the lowered helper gives `@rovy/ui` stable widget-call identity for `useState` and `useEffect`.

### Style param lowering

`style: Style` is not ordinary resource injection. It is runtime context sugar:

```ts
/** @widget */
export function Window(style: Style, props: WindowProps): void { ... }
```

Lowered shape:

```ts
function Window(props: WindowProps): void {
	const style = RovyUi.getActiveStyle();
	...
}
```

The widget body reads active style at call time. The style does not travel through `RovyUi.__widget(...)` registration metadata.

### Style scope

Temporary style changes are callback-bounded:

```ts
StyleScope(
	{
		patch: { textColor: Color3.fromRGB(255, 220, 120) },
		discriminator: item.id,
	},
	() => {
		Label({ text: "Rare Item" });
	},
);
```

The runtime model should behave like:

- enter scoped active style for the callback body
- partial-merge patch onto the parent active style
- run child callback
- restore parent active style automatically when callback exits

This is intentionally not a public `pushStyle` / `popStyle` API.

### Other widget params

Other widget runtime inputs may still follow the "injected params before authored call args" rule, but `style: Style` is specifically active-style sugar rather than a `Res<T>`-style injection.

### Non-goals

UI lowering explicitly does **not** include:

- a public widget-class construction path
- React-style component trees
- gameplay state hidden inside widget-local storage

## Module loading

Roblox ModuleScripts do not run unless required. A self-registering module is silently absent if no game code requires it.

`rovy.loadPaths(...)` solves this — authored TS passes string paths like `"src/client/systems"`. The transformer resolves each string to the matching Roblox Instance root via the active `.rovy.json` environment's Rojo config, then runtime recursively requires every `ModuleScript` under that instance so every injected `rovy.__*` side effect runs.

```ts
rovy.loadPaths(
	"src/client/components",
	"src/client/systems",
	"src/client/observers",
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

- [Trait runtime](/concepts/trait-runtime.md)
- [Systems and injection](/concepts/systems-and-injection.md)
- [Monitors](/concepts/monitors.md)
- [Packages](/packages/packages.md)
- [Networking](/packages/networking.md)
- [UI](/packages/ui.md)
