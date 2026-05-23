# World Inspector (`@rovy/world-inspector`)

`@rovy/world-inspector` is an optional in-game inspection tool for Rovy worlds.
It gives you a UI for:

- browsing entities and registered components
- opening entity detail windows
- editing component values and tags
- spawning and despawning entities
- inspecting the local client world, the server world, or another player's client world

It is built as a separate package on top of `@rovy/networking` and `@rovy/ui`.

## What it is for

Use the inspector when you want a live debugging surface inside Studio or a
debug build of your game.

It is especially useful for:

- verifying which entities actually exist on client vs server
- checking whether a component or tag was inserted, removed, or changed
- testing `Changed<C>` and `Removed<C>`-driven behavior
- editing ECS state without writing one-off debug code

It is not a replacement for gameplay replication. Remote inspection works by
requesting snapshots and forwarding edits through inspector-specific net events.
It does **not** mean Rovy now has automatic entity/component replication.

## Install

```sh
npm i @rovy/world-inspector
```

This package depends on `@rovy/networking` and `@rovy/ui`, so install those too
when you use it directly.

## Client plugin

On the client, add `WorldInspectorPlugin`. Give it a UI root and the schedules
it should render on and use for inspector networking:

```ts
import { App } from "@rovy/core";
import {
  ToggleWorldInspector,
  WorldInspectorPlugin,
} from "@rovy/world-inspector";

const app = new App();

app.addPlugin(
  new WorldInspectorPlugin({
    uiRoot: playerGuiScreenGui,
    renderSchedule: Render,
    networkSchedule: Render,
  }),
);

app.start();

// Bind this however you want.
app.world.trigger(new ToggleWorldInspector());
```

Local inspection works with the render plugin alone. Remote inspection requires
the server plugin too.

## Server plugin

On the server, add `WorldInspectorServerPlugin` and choose which schedule owns
its networking work:

```ts
import { App } from "@rovy/core";
import { WorldInspectorServerPlugin } from "@rovy/world-inspector";

const app = new App();

app.addPlugin(
  new WorldInspectorServerPlugin({
    schedule: Update,
    access: (ctx) => ctx.action === "view" && ctx.targetKind === "server",
  }),
);
```

The `access` callback gates remote actions:

- `action: "view"` for target discovery and snapshots
- `action: "edit"` for spawn/set/remove/despawn edits
- `targetKind: "server"` for the server ECS world
- `targetKind: "player"` for another player's client ECS world

If access is denied, the requester gets an empty snapshot or failed edit
response.

## Targets and behavior

The inspector exposes three target kinds:

- `local` — the current world the plugin is attached to
- `server` — the server world, requested over inspector net events
- `player` — another client's local world, relayed through the server

Behavior differs by target:

- Local edits apply directly to that world.
- Remote edits queue an inspector request and apply on the owning side.
- Remote snapshots update the inspector UI snapshot cache; they do not
  automatically reconstruct gameplay entities in the target world.

## Public surface

Main exports:

- `WorldInspectorPlugin`
- `WorldInspectorServerPlugin`
- `WorldInspectorState`
- `ShowWorldInspector`
- `HideWorldInspector`
- `ToggleWorldInspector`
- `renderWorldInspector(...)`

Advanced exports also exist for custom inspector UIs and tooling:

- remote event DTOs
- target, snapshot, and edit DTO helpers
- component name helpers
- instance expression parsing helpers

## Instance field syntax

When editing an `Instance`-like field, use a service-rooted path:

```txt
Workspace/MyPart
Workspace/Zombie/HumanoidRootPart
ReplicatedStorage/Folder/RemoteEvent
Workspace/MyPart.Position
```

Do **not** prefix with `game/`. The parser starts at a Roblox service already,
so `game/Workspace/Part` is invalid.

Supported roots include:

- `Workspace`
- `ReplicatedStorage`
- `ServerStorage`
- `StarterGui`
- `Players`
- `Lighting`
- `SoundService`
- `CollectionService`

Lowercase service names like `workspace/...` also work.

## Example

The zombie example includes the inspector on the client and toggles it from an
input binding. See [Example Projects](/examples/) for the runnable project.

## See also

- [Packages Overview](/packages/packages.md)
- [Networking](/packages/networking.md)
- [UI](/packages/ui.md)
- [Examples](/examples/)
