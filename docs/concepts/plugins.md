# Plugins

A plugin extends `App` before the registry finalizes. Plugins also act as an ownership boundary for decorated classes, but the ownership rule is strict:

- if the `@plugin` class is in `index.ts`, that file defines a subtree root and decorated descendants under that folder belong to the plugin
- if the `@plugin` class is in any non-`index.ts` file, only decorated classes in that exact file belong to the plugin

`rovy.loadPaths(...)` still discovers decorated modules globally, but plugin-owned systems, resources, events, observers, and monitors only finalize when that plugin is explicitly added to the app.

## `Plugin` interface

```ts
import type { App, Plugin } from "@rovy/core";
import { plugin } from "@rovy/core";

@plugin
export class GameClockPlugin implements Plugin {
  build(app: App): void {
    // called during app.start(), before registry finalizes
  }
}
```

Add it to the app explicitly:

```ts
const app = new App();
app.addPlugin(new GameClockPlugin());
app.start();
```

`build()` fires after all other `addPlugin` calls and before `runAppExtensions`. The registry is not yet finalized when `build()` runs, so the plugin can still call `configureSets`, `insertResource`, and `insertParam`.

## Discovery vs activation

```ts
rovy.loadPaths("src/shared");      // discover metadata
app.addPlugin(new GameClockPlugin()); // activate plugin-owned entries
app.start();                       // finalize only active plugin entries
```

Ownership matching is done by the runtime plugin table/class value, not by a string key. That means user plugins, local packages, and installed node modules all use the same activation rule.

## Plugin-owned modules

Decorated classes can belong to a plugin, but only according to the strict module-boundary rule above.

Same-file ownership always works:

```ts
import { ResMut, schedule, system } from "@rovy/core";
import { GameClock } from "./registry";

@schedule
export class GameClockUpdate {}

@system({ schedule: GameClockUpdate })
class GameClockTick {
  run(clock: ResMut<GameClock>) {
    clock.tick += 1;
  }
}
```

That system is discovered when the module loads, but it is only added to the scheduler if `GameClockPlugin` is active on the app.

## How systems are found

There are two separate steps:

1. discovery
2. activation

### 1. Discovery

`rovy.loadPaths(...)` force-requires the module tree. When a module containing a decorated class runs, the transformer-injected `rovy.__*` call executes immediately as a side effect.

For a plugin-owned system, the emitted metadata conceptually looks like this:

```ts
@plugin
export class GameClockPlugin implements Plugin {
  build(app: App): void {}
}

@system({ schedule: GameClockUpdate })
class GameClockTick {
  run(clock: ResMut<GameClock>) {
    clock.tick += 1;
  }
}
```

Conceptual output:

```luau
rovy:__plugin(GameClockPlugin, {
  id = "src/runtime/plugin",
  root = "src/runtime/plugin",
})

rovy:__system(GameClockTick, {
  id = "plugin@GameClockTick",
  plugin = GameClockPlugin,
  schedule = GameClockUpdate,
  params = { ... },
})
```

So the runtime registry learns:

- this plugin exists
- this system belongs to that plugin

The system is now **known**, but not yet active.

### 2. Ownership resolution

Ownership is assigned at build time by the transformer:

- same-file decorated classes always belong to the plugin in that file
- `index.ts` is the only implicit subtree-root convention
- non-`index.ts` plugin files are single-module only
- nested subtree plugins still use nearest-root wins
- if no plugin root owns the file, the class stays unowned and behaves like normal global Rovy metadata

If the plugin class lives in `index.ts`, that file defines the plugin root for the folder subtree.

Example:

```txt
src/
  combat/
    index.ts              ← contains @plugin CombatPlugin
    registry.ts           ← owned by CombatPlugin
    systems/
      tick.ts             ← owned by CombatPlugin
      damage.ts           ← owned by CombatPlugin
    observers/
      death.ts            ← owned by CombatPlugin
    nested/
      fx.ts               ← owned by CombatPlugin
  shared/
    health.ts             ← not owned by CombatPlugin
```

With this structure:

- `src/combat/index.ts` defines the plugin root
- anything under `src/combat/**` belongs to `CombatPlugin`
- `src/shared/health.ts` does not belong to `CombatPlugin`

So if `tick.ts` contains:

```ts
@system({ schedule: CombatUpdate })
class TickCombat {
  run() {}
}
```

the transformer treats it as plugin-owned because it is under `src/combat/`, which is the folder rooted by the plugin file `src/combat/index.ts`.

Conceptually that becomes:

```luau
rovy:__system(TickCombat, {
  id = "systems/tick@TickCombat",
  plugin = CombatPlugin,
  schedule = CombatUpdate,
  params = {},
})
```

The important rule is:

- `index.ts` is the only file that implicitly turns a folder into a plugin subtree root
- putting the plugin in `index.ts` is the normal way to make a whole folder tree belong to that plugin

If the plugin is **not** in `index.ts`, it is single-module only.

Example:

```txt
src/
  combat/
    plugin.ts             ← contains @plugin CombatPlugin
    registry.ts           ← not owned by CombatPlugin
    systems/
      tick.ts             ← not owned by CombatPlugin
      damage.ts           ← not owned by CombatPlugin
  ui/
    hud.ts                ← not owned by CombatPlugin
```

Here `plugin.ts` is just a single module. It does not create a subtree root.

So:

- `src/combat/plugin.ts` is owned
- `src/combat/registry.ts` is not owned
- `src/combat/systems/tick.ts` is not owned
- `src/ui/hud.ts` is not owned

This means it **is** limited to decorated classes in `plugin.ts` itself.

The current mental model should be:

- `index.ts` plugin file defines a root folder
- non-`index.ts` plugin file defines only its own module
- descendants are only implicitly owned in the `index.ts` case

### 3. Activation

When you call:

```ts
app.addPlugin(new GameClockPlugin());
```

the app records the plugin's runtime class/metatable table as active.

Later, during `app.start()`, the runtime filters registry entries:

- unowned systems are always kept
- plugin-owned systems are kept only if their `plugin` table matches one of the app's active plugins

That means a plugin-owned system can be discovered by `rovy.loadPaths(...)` but still be skipped entirely unless its plugin was added.

### 4. What `addPlugin(new Plugin())` matches against

Matching is **not** done by name, path, or string id.

It matches by runtime plugin table identity:

- generated system metadata stores `plugin = GameClockPlugin`
- `app.addPlugin(new GameClockPlugin())` records the metatable/class table behind that instance
- `app.start()` compares those two table values

If they are the same table, the system activates. If they are different tables, it does not.

This is why two installed packages can both have a `Plugin` class or similar source paths without colliding: ownership uses the actual runtime class value, not a shared string key.

## External params

Plugins can still inject runtime handles via `insertParam`. Systems receive them as `Res<Handle>`:

```ts
export const GAME_CLOCK_PARAM = "@rovy/example-gameclock/GameClock";

export class GameClock {
  tick = 0;
}

export class GameClockPlugin implements Plugin {
  private readonly clock = new GameClock();

  build(app: App): void {
    app.insertParam(GAME_CLOCK_PARAM, this.clock);
  }
}
```

Consumer system:

```ts
import { GameClock } from "@rovy/example-gameclock";

@system({ schedule: Update })
class ReadClock {
  run(clock: Res<GameClock>) {
    print(clock.tick);
  }
}
```

The transformer sees `Res<GameClock>` and emits `{ kind: "external", id: GAME_CLOCK_PARAM }`. At `app.start()` the resolver finds the value in the params map and injects it.

**Stable ID convention:** use `"@scope/package/ClassName"`. This is a plain string key — pick one and keep it consistent across the plugin package.

## `registerAppExtension`

`registerAppExtension` fires at module load time and is called again at every `app.start()`. It receives the full `RovyRegistry` so the plugin can inspect what the user registered and auto-wire only when needed.

```ts
import { registerAppExtension } from "@rovy/core";
import type { RovyRegistry, ParamDescriptor } from "@rovy/core";

function paramsNeedClock(params: ReadonlyArray<ParamDescriptor>): boolean {
  return params.some((p) => p.kind === "external" && p.id === GAME_CLOCK_PARAM);
}

function registryNeedsClock(registry: RovyRegistry): boolean {
  for (const sys of registry.systems) if (paramsNeedClock(sys.params)) return true;
  for (const obs of registry.observers) if (paramsNeedClock(obs.params)) return true;
  for (const mon of registry.monitors) if (paramsNeedClock(mon.params)) return true;
  return false;
}

registerAppExtension((app, registry) => {
  if (!registryNeedsClock(registry)) return;
  app.addPlugin(new GameClockPlugin());
});
```

Extensions fire **after** all `plugin.build()` calls and before the registry finalizes. They cannot call `addPlugin` (plugins have already run); call `insertParam` and `insertResource` directly on the app instead, or use `addPlugin` from within your build method and guard against double-install.

Use `registerAppExtension` for zero-config auto-wiring. Use `addPlugin` directly when you need to pass constructor options.

## Plugin registry pattern

When a plugin needs decorator metadata (like `@rovy/networking`'s `@netEvent`), add a registry object that the transformer populates:

```ts
// registry.ts
export const myPluginRegistry = {
  entries: new Array<{ ctor: Ctor; name: string }>(),

  __register(ctor: Ctor, meta: { name: string }): void {
    this.entries.push({ ctor, ...meta });
  },

  byCtor(ctor: Ctor) {
    return this.entries.find((e) => e.ctor === ctor);
  },
};
```

The transformer injects `myPluginRegistry.__register(ClassName, { name: "..." })` after each decorated class. The plugin reads `myPluginRegistry.entries` inside `build()`.

## Order of operations in `app.start()`

```txt
1. plugin.build(app)          ← each addPlugin, in order
2. runAppExtensions(app, reg) ← registerAppExtension callbacks
3. finalize components/resources/relations/traits
4. build queries
5. register events/observers/monitors
6. build scheduler
7. runOnStart systems
```

Plugins see an unfinalised registry. Extensions see the final registry snapshot.

## See also

- [Networking](/packages/networking.md) — production plugin using this pattern
- [Runtime lifecycle](/runtime/lifecycle.md) — full `app.start()` sequence
- [Packages](/packages/packages.md) — how to ship a plugin as a separate roblox-ts package
