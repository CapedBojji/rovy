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

Rovy ships as two packages, Flamework-style: `@rovy/core` (decorators, types, **and the packaged runtime** — what you import) and `rovy-transformer` (build-time roblox-ts plugin, listed once in `tsconfig.json`). You author only against `@rovy/core`. See [Packages](21-packages.md).

## See also

- [Packages](21-packages.md)
- [Components](02-components.md)
- [Schedules](07-schedules.md)
- [Transformer](10-transformer.md)
