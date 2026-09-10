# `@rovy/world-inspector`

Optional in-game ECS inspector for
[Rovy](https://github.com/CapedBojji/rovy) worlds. A live debugging surface for
Studio and debug builds, built on
[`@rovy/networking`](https://www.npmjs.com/package/@rovy/networking) and
[`@rovy/imgui`](https://www.npmjs.com/package/@rovy/imgui).

It lets you:

- browse entities, registered components, and inspected resources
- open entity detail windows
- edit component values, tags, and inspected resource values
- spawn and despawn entities
- inspect the local client world, the server world, or another player's world
- record per-frame component changes and opted-in resource snapshots

It is not a replacement for gameplay replication — remote inspection requests
snapshots and forwards edits over inspector-specific net events.

## Install

```sh
npm i @rovy/core @rovy/networking @rovy/imgui @rovy/world-inspector
```

## Client

```ts
import { App } from "@rovy/core";
import { ToggleWorldInspector, WorldInspectorPlugin } from "@rovy/world-inspector";

const app = new App();

app.addPlugin(
  new WorldInspectorPlugin({
    uiRoot: playerGuiScreenGui,
    renderSchedule: Render,
    networkSchedule: Render,
  }),
);

app.start();
app.world.trigger(new ToggleWorldInspector());
```

Local inspection works with the client plugin alone.

## Server

Remote inspection also needs `WorldInspectorServerPlugin`, whose `access`
callback gates every remote action:

```ts
import { WorldInspectorServerPlugin } from "@rovy/world-inspector";

app.addPlugin(
  new WorldInspectorServerPlugin({
    schedule: Update,
    access: (ctx) => ctx.action === "view" && ctx.targetKind === "server",
  }),
);
```

`action` is `"view"` or `"edit"`; `targetKind` is `"server"` or `"player"`.
Denied requests get an empty snapshot or a failed edit response.

Resources are hidden from the inspector unless the resource class carries
`@inspect` from `@rovy/core`.

## Documentation

<https://capedbojji.github.io/rovy/packages/world-inspector>

## License

MIT
