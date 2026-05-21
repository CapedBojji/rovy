# Plugins

A plugin extends `App` before the registry finalizes. Plugins inject runtime handles, register internal systems, and configure set ordering — anything that needs to run once at boot.

## `Plugin` interface

```ts
import type { App } from "@rovy/core";
import type { Plugin } from "@rovy/core";

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

## External params

Plugins inject runtime handles via `insertParam`. Systems receive them as `Res<Handle>`:

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
