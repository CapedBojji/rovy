# Example Projects

The Rovy repo ships runnable example projects under `examples/`. Each is a workspace
package you can build and open in Roblox Studio. They are the best way to see Rovy
patterns in a real layout.

## Building examples

From the repo root, each example delegates to its package-level `rovy build` /
`rovy start` scripts:

```sh
pnpm build:example      # build the roblox-ts game example
pnpm dev:example        # build + watch
pnpm open:example       # build + open in Studio

pnpm build:ui-inventory # UI inventory example
pnpm dev:ui-inventory
pnpm open:ui-inventory

pnpm build:zombie       # zombie game example
pnpm dev:zombie
pnpm open:zombie

pnpm build:multiplace   # multi-place template
pnpm test:multiplace

pnpm build:examples     # build the main playable examples
```

Inside an example package, use the Rovy build CLI directly:

```sh
pnpm build # runs rovy build with the package's rovy-build config
pnpm compile # runs rbxtsc + Rovy generators
pnpm generate # runs Rovy generators only
pnpm watch # runs rovy watch
pnpm open  # runs rovy open
pnpm start # runs rovy build, then rovy open/watch
pnpm stop  # stops tracked watch/Studio processes
```

`rovy build` is the one-shot place build. It runs `rbxtsc`, runs Rovy generators
such as Blink output when enabled, then runs Rojo with the package's
`rovy-build.rojoBuildArgs`. `rovy start` is the full local loop: build the place,
open Studio, and keep `rojo serve` / `rbxtsc -w` running.

## The examples

### roblox-ts game — `examples/roblox-ts-game`

Package `@rovy/example-game`. A baseline roblox-ts game wired with Rovy. Shows the
minimal `server` / `client` / `shared` boundary layout, component and system
authoring, and the `App` boot sequence. Start here if you want the smallest complete
project.

Source: [`examples/roblox-ts-game/src`](https://github.com/CapedBojji/rovy/tree/main/examples/roblox-ts-game/src)

### UI inventory game — `examples/ui-inventory-game`

Package `@rovy/example-ui-inventory-game`. Demonstrates `@rovy/ui` — the function-first
immediate-mode widget runtime — driving an inventory screen. Shows widget calls,
keyed state helpers (`useState`, `useEffect`, `useInstance`), and how UI state connects
to ECS resources and components.

Source: [`examples/ui-inventory-game/src`](https://github.com/CapedBojji/rovy/tree/main/examples/ui-inventory-game/src)

### Zombie game — `examples/zombie-game`

Package `@rovy/example-zombie-game`. The largest example: a full client/server game
with components, resources, collectors (external Roblox/Flamework signal translation),
shared network contracts, and a Blink-backed networking layer. Use it as a reference
for [collectors](/concepts/collectors), [networking](/packages/networking), and
the in-game [World Inspector](/packages/world-inspector). The client example binds
the inspector toggle to `F2`.

Source: [`examples/zombie-game/src`](https://github.com/CapedBojji/rovy/tree/main/examples/zombie-game/src)

### Multi-place template — `examples/multiplace-template`

Package `@rovy/multiplace-template`. A roblox-ts multi-place layout inspired by
`roblox-ts/demo-multiplace-game`: each place owns its own Rojo project, while
root per-place tsconfigs compile `projects/shared/src` into both place outputs.

```sh
pnpm build:multiplace
pnpm --filter @rovy/multiplace-template build:lobby
pnpm --filter @rovy/multiplace-template build:arena
pnpm test:multiplace
```

Source: [`examples/multiplace-template`](https://github.com/CapedBojji/rovy/tree/main/examples/multiplace-template)

### Plugin example — `examples/plugin-example`

Package `@rovy/example-gameclock`. A minimal `@plugin` package: a registry, a plugin
class, plugin-owned `@resource` / `@system` modules, and an entry point. Shows how
discovery through module loads stays separate from runtime activation through
`app.addPlugin(...)`. See [Plugins](/concepts/plugins).

Source: [`examples/plugin-example/src`](https://github.com/CapedBojji/rovy/tree/main/examples/plugin-example/src)

## Worked walkthrough

For an annotated, code-first walkthrough of a complete domain — components, events,
observers, monitors, and buffered damage-over-time — see the
[Combat System example](/examples/combat-system).
