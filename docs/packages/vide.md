# Rovy Vide

`@rovy/vide` is Rovy's reactive UI integration package for [Vide](https://centau.github.io/vide/). It gives gameplay UI a class-decorated, ECS-aware authoring surface while keeping mounting explicit.

Use it when UI should react to Rovy world state:

- HUD roots mounted from client bootstrap code
- render signatures that declare ECS data needs
- query row sources for component/query values
- monitor streams for enter/change/exit UI state
- event-driven UI feeds such as combat logs

`@rovy/vide` does not replace [`@rovy/ui`](/packages/ui). `@rovy/ui` is Rovy's immediate-mode widget/tool package. `@rovy/vide` is the production reactive UI path for Vide-authored Roblox UI.

## Install

```sh
npm i @rovy/vide @rbxts/vide
```

You also need `@rovy/core` and `rovy-transformer` configured as usual:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "transform": "rovy-transformer"
      }
    ]
  }
}
```

`@view` is transformer-backed. The decorator is imported from `@rovy/vide`, but the transformer injects the runtime registration call.

View classes should expose one public UI method: `render(...)`. The render signature declares what the view needs, and Rovy injects source-backed facades so Vide updates reactive reads.

## Root Views

A root view is a class with `@view()` and `render(...)`.

```ts
import Vide from "@rbxts/vide";
import { App, type Res } from "@rovy/core";
import { mountView, view } from "@rovy/vide";

class GameClock {
  constructor(public tick = 0) {}
}

@view()
class HudView {
  render(clock: Res<GameClock>): Frame {
    return Vide.create("TextLabel", {
      BackgroundTransparency: 1,
      Size: UDim2.fromScale(1, 1),
      Text: () => `Tick ${clock.tick}`,
    });
  }
}

const app = new App();
app.start();

const handle = mountView(app, HudView);
```

`mountView(app, HudView)` creates a Vide root scope. If no `target` is passed, Rovy creates a `ScreenGui`, parents it to `Players.LocalPlayer.PlayerGui` when available, and destroys it on unmount.

```ts
const handle = mountView(app, HudView, {
  target: existingScreenGui,
});

handle.destroy();
```

## Render Injection

Views use system-style params. Rovy lowers these params at build time and injects reactive UI facades at mount time.

```ts
import Vide from "@rbxts/vide";
import { component, Entity, type EventReader, type Query, type With } from "@rovy/core";
import { view, type ViewMonitor } from "@rovy/vide";

@component
class Player {}

@component
class Health {
  constructor(public current = 100, public max = 100) {}
}

class DamageTaken {
  constructor(public amount: number) {}
}

@view()
class HudView {
  render(
    health: Query<[Entity, Health], With<Player>>,
    monitor: ViewMonitor<[Entity, Health], With<Player>>,
    damage: EventReader<DamageTaken>,
  ): Frame {
    return Vide.create("Frame", {
      [1]: Vide.values(health.rows(), (row) => {
        const [entity, value] = row.values;
        return Vide.create("TextLabel", {
          Name: `Health_${entity}`,
          BackgroundTransparency: 1,
          Text: () => `${value.current}/${value.max}`,
        });
      }),
      [2]: Vide.values(monitor.entered(), (row) => {
        return Vide.create("TextLabel", {
          BackgroundTransparency: 1,
          Text: `Joined ${row.entity}`,
        });
      }),
      [3]: Vide.values(damage.events(), (event) => {
        return Vide.create("TextLabel", {
          BackgroundTransparency: 1,
          Text: `-${event.amount}`,
        });
      }),
    });
  }
}
```

Supported render params:

- `Query<Terms, ...filters>` - reactive query facade
- `ViewMonitor<Terms, ...filters>` - reactive current/entered/changed/exited streams
- `Res<T>`, `ResMut<T>`, `OptRes<T>` - shallow reactive resource proxies
- `EventReader<E>` - non-draining reactive event reader
- `Commands`, `World`, `EventWriter<E>`, `Local<T>`, external params, collectors, and `ViewContext`

Mutations are allowed for input handlers or explicit Vide effects. Avoid mutating ECS state during the top-level render pass because reactive rendering can run more than once.

## Queries

Injected `Query<T>` keeps the normal query methods and adds a view-only `rows()` source:

```ts
render(players: Query<[Entity, Health], With<Player>>): Frame {
  return Vide.create("Frame", {
    [1]: Vide.values(players.rows(), (row) => {
      const [entity, health] = row.values;
      return Vide.create("TextLabel", {
        Name: `Player_${entity}`,
        Text: () => `${health.current}/${health.max}`,
      });
    }),
  });
}
```

`rows()` returns `Vide.Source<ReadonlyArray<ViewRow<Terms>>>`.

```ts
interface ViewRow<Terms> {
  readonly entity: Entity;
  readonly values: ResolveTerms<Terms>;
}
```

Rows are always keyed by entity. If `Entity` is also part of `Terms`, it still appears in `values`.

The existing query helpers read the backing source too:

```ts
render(players: Query<[Health], With<Player>>): TextLabel {
  return Vide.create("TextLabel", {
    Text: () => `Players: ${players.size()}`,
  });
}
```

## Monitors

Use `ViewMonitor<Terms, ...filters>` when UI needs lifecycle streams without writing `onEnter`, `onChange`, or `onExit` methods.

```ts
render(health: ViewMonitor<[Entity, Health], With<Player>>): Frame {
  return Vide.create("Frame", {
    [1]: Vide.values(health.current(), (row) => {
      const [entity, value] = row.values;
      return Vide.create("TextLabel", {
        Name: `Current_${entity}`,
        Text: () => `${value.current}/${value.max}`,
      });
    }),
    [2]: Vide.values(health.exited(), (row) => {
      return Vide.create("TextLabel", {
        Text: `Left ${row.entity}`,
      });
    }),
  });
}
```

`current()`, `entered()`, `changed()`, and `exited()` are Vide sources. `exited()` keeps the last known row snapshot.

## Events

Injected `EventReader<E>` is source-backed and non-draining.

```ts
render(damage: EventReader<DamageTaken>): Frame {
  return Vide.create("Frame", {
    [1]: Vide.values(damage.events(), (event) => {
      return Vide.create("TextLabel", {
        Text: `-${event.amount}`,
      });
    }),
  });
}
```

`ctx.events(EventCtor, { limit })` remains available as a lower-level helper for UI-local event feeds.

## ViewContext

`ViewContext` is optional. Inject it only when the view needs the `App`, mount target, or nested mounting.

```ts
import { view, type ViewContext } from "@rovy/vide";

@view()
class RootHud {
  render(ctx: ViewContext): Frame {
    const child = ctx.mount(CombatFeedView);

    return Vide.create("Frame", {
      Destroying: () => child.destroy(),
    });
  }
}
```

Nested handles are tracked by the parent mount and cleaned up when the parent is destroyed.

## API Reference

```ts
function view(options?: ViewOptions): ClassDecorator;

interface ViewOptions {
}

function mountView(app: App, viewCtor: Ctor, options?: MountedViewOptions): ViewHandle;
function unmountView(handle: ViewHandle): void;

interface MountedViewOptions {
  readonly target?: Instance;
  readonly name?: string;
}

interface ViewHandle {
  readonly destroy: () => void;
}

interface ViewContext {
  readonly app: App;
  readonly target?: Instance;
  query<T extends ReadonlyArray<unknown>>(handle: string): Vide.Source<ReadonlyArray<T>>;
  events<T extends object>(eventCtor: Ctor<T>, options?: { limit?: number }): Vide.Source<ReadonlyArray<T>>;
  mount(viewCtor: Ctor, options?: MountedViewOptions): ViewHandle;
}
```

`rovyVide.__view(...)` is exported for transformer output. Do not call it by hand.

## Transformer Contract

For a decorated view:

```ts
@view()
class HudView {
  render(health: Query<[Entity, Health], With<Player>>): Vide.Node {
    return Vide.values(health.rows(), (row) => {
      const [entity, value] = row.values;
      return Vide.create("TextLabel", {
        Name: `Health_${entity}`,
        Text: `${value.current}/${value.max}`,
      });
    });
  }
}
```

the transformer emits a core query descriptor and a Vide view registration roughly like:

```ts
rovy.__query({
  id: "src/client/ui/hud-view@HudView:0",
  terms: [
    { t: "entity" },
    { t: "component", ctor: Health },
  ],
  filters: { with: [Player] },
});

rovyVide.__view(HudView, {
  id: "src/client/ui/hud-view@HudView",
  methods: ["render"],
  params: [
    { kind: "query", handle: "src/client/ui/hud-view@HudView:0" },
  ],
});
```

The real emitted shape is optimized for roblox-ts output, but the contract is the same: Rovy core owns query handles, and `@rovy/vide` owns view registration, param facades, and mounting.

The transformer also validates:

- `@view` classes must define `render(...)`
- `match` options on `@view` are rejected; declare `Query<...>` or `ViewMonitor<...>` render params
- `events` maps on `@view` are rejected; declare `EventReader<...>` render params

## Vide Notes

Rovy uses Vide sources and scopes underneath:

- [Vide sources](https://centau.github.io/vide/tut/crash-course/4-source.html)
- [Vide implicit effects](https://centau.github.io/vide/tut/crash-course/8-implicit-effect.html)
- [Vide scopes](https://centau.github.io/vide/tut/crash-course/6-scope.html)
- [Vide README](https://github.com/centau/vide)

Pass functions or sources into Vide props/children when you want UI to update. Rovy keeps query, monitor, resource, and event facades fresh after Rovy flush boundaries.

## Standalone Game Template

The standalone `rovy-game-template` consumes `@rovy/vide` from the local packed tarball during local development:

```json
{
  "dependencies": {
    "@rbxts/vide": "0.6.1",
    "@rovy/vide": "file:../rovy/build/rovy-vide-0.0.0.tgz"
  }
}
```

Its default client bootstrap mounts a blank decorated HUD:

```ts
import { mountView } from "@rovy/vide";
import { bootTemplateApp } from "shared/bootstrap";
import { TemplateUi } from "./ui/template-ui";

const app = bootTemplateApp();
mountView(app, TemplateUi);
```

That keeps new games on the official reactive UI path without adding gameplay systems, networking, datastore, or inspector code by default.

The template also has UI Claps wired for the starter Vide HUD:

```sh
cd ../ui-claps
pnpm install
pnpm run build

cd ../rovy-game-template
pnpm install
pnpm run ui
```

`ui-claps.config.ts` uses `root: "src"` and `storyRoot: "out"`. The source story
lives at `src/client/ui/template-ui.story.ts`; `pnpm run ui` compiles first, then
UI Claps discovers the compiled `out/client/ui/template-ui.story.luau` file and
previews the `TemplateUi` frame as one focused story with editable text, UDim,
UDim2, opacity, and color controls.

## Related Pages

- [Rovy UI](/packages/ui) for immediate-mode tools and debug widgets
- [Queries](/concepts/queries) for `Query<...>` and query terms
- [Monitors](/concepts/monitors) for ECS lifecycle reactions outside UI
- [Events](/concepts/events) for local Rovy events
- [Transformer](/runtime/transformer) for compile-time lowering
