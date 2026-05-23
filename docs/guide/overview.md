# Overview

## Goals

Build a high-level ECS API for Roblox-TS that feels closer to Bevy while using jecs as the storage/query backend.

jecs handles the low-level mechanics. This layer adds decorator-based authoring, trait metadata, event observers, lifecycle monitors, commands, and a custom scheduler.

## Architecture

```txt
Game code
  ↓
Bevy-like Roblox-TS API
  ↓
rovy registries / traits / observers / monitors / scheduler / commands
  ↓
jecs world
```

## Non-goals

Do not fork jecs unless absolutely necessary. Wrap; do not rewrite.

## Layered responsibilities

| Layer | Owns |
|-------|------|
| jecs | entity ids, component storage, raw queries, relationships, lifecycle hooks |
| Rovy runtime | `rovy` registries + `loadPaths`, `app.start()` finalize, `App`, `World` wrapper, `Commands`, scheduler, observer/monitor dispatch, event buffers, resources |
| Transformer | decorator scanning, trait discovery, `rovy.__*` registration-call injection, query hoisting, macro lowering, param injection |
| User code | `@component`/`@resource` classes, `@event`, traits (interfaces), `@system`/`@observer`/`@monitor`, `@relation`, `@schedule` |

## Packages

Rovy ships as a runtime/build split:

- `@rovy/core` — decorators, types, and the packaged ECS runtime
- `rovy-transformer` — the build-time roblox-ts plugin
- optional runtime packages such as `@rovy/networking`, `@rovy/ui`, and `@rovy/world-inspector`

Most ECS code still authors against `@rovy/core`, including string-path
`rovy.loadPaths("src/client/systems")`. See [Packages](/packages/packages.md).

## See also

- [Packages](/packages/packages.md)
- [World Inspector](/packages/world-inspector.md)
- [Components](/concepts/components.md)
- [Schedules](/concepts/schedules.md)
- [Transformer](/runtime/transformer.md)
