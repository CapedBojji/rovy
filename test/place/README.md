# Rovy integration place

A real Roblox place, compiled from TypeScript by `rbxtsc` with
`rovy-transformer`, built by Rojo, and driven inside Roblox Studio by
`run-in-roblox`. The Zune specs under `packages/*/test` run Rovy against a fake
DataModel; this place runs it against the real one.

```sh
pnpm test:place    # compile, build the .rbxl, run it in Studio
pnpm build:place   # compile and build the .rbxl only, no Studio
```

## What it asserts

| Case | Covers |
| --- | --- |
| ui mounts against a real DataModel | `app.mount` produces real Instances under a `ScreenGui` |
| shared document opens | `@rovy/datastore` opens a keyed document through the mock adapter |
| ui rerenders on `DocumentChanged` | `$eventTrigger` on a package-owned event |
| ui rerenders on `DocumentSaved` | a second document event kind |
| ui rerenders on a class-constructor event | the branch `@rovy/scribe` events take |
| shared document opens with a string key | `sharedDocument` keys reach the runtime as callables |
| hud builds a styled panel with layout children | `UICorner`/`UIPadding`/`UIListLayout` children land under the panel |
| hud labels render live state | label text reflects the state at render time |
| rerender patched the live Instance | reconciliation wrote back to the mounted Instance |

### The two `$eventTrigger` branches

`@rovy/scribe` declares its events as ordinary `@scribeEvent` classes, so
`$eventTrigger(SomeScribeEvent)` gets a real constructor.

`@rovy/datastore` has no class to name — its document events are keyed by a
transformer-generated document id — so the trigger names the event *type* and
the transformer resolves the constructor, the same way it resolves the matching
`EventReader` param:

```ts
static rerender = [$eventTrigger<DocumentChanged<typeof Profile>>()];
```

Both branches end as `{ kind: "event", ctor }`, so covering each once covers the
mechanism for every package that emits Rovy events.

## Looking at it

`src/client/main.client.ts` runs in `StarterPlayerScripts`, so opening
`.build/rovy-integration.rbxl` in Studio and pressing Play shows the same `Hud`
component the headless cases assert, plus the world inspector over a few spawned
entities.

The headless run also prints the built tree, so the shape is reviewable without
Studio:

```txt
ROVY_VISUAL_TREE
ScreenGui "RovyHudProbe"
  Frame "HudPanel" size={0, 280}, {0, 96}
    UICorner "UICorner"
    UIPadding "UIPadding"
    UIListLayout "UIListLayout"
    TextLabel "Title" text="Rovy UI" size={0, 256}, {0, 22}
    TextLabel "Frames" text="rendered frames: 42" size={0, 256}, {0, 18}
    TextLabel "Hint" text="world inspector: open" size={0, 256}, {0, 18}
```

## What it does not cover

`@rovy/scribe`'s own runtime is player-profile scoped and needs a joined
`Player` plus real client/server boundaries. `run-in-roblox` drives an edit-mode
session with neither, so scribe's runtime is exercised by
`packages/scribe/test/studio`, which runs under a single-player playtest.

The document adapter here is the in-memory mock. Real DataStore traffic needs a
published place.

## Requirements

`run-in-roblox` 0.3.0 hardcodes
`/Applications/RobloxStudio.app/Contents/MacOS/RobloxStudio` and has no override
flag. macOS installs Studio as `/Applications/Roblox Studio.app` (with a space),
and version managers relocate it again, so a symlink is usually needed:

```sh
ln -s '/Applications/Roblox Studio.app' /Applications/RobloxStudio.app
```

`pnpm test:place` checks for that path first and explains the fix rather than
letting run-in-roblox panic.
