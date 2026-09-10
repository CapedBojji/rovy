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
