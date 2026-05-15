# Overview

## Goals

Build a high-level ECS API for Roblox-TS that feels closer to Bevy while using jecs as the storage/query backend.

jecs handles the low-level mechanics. This layer adds authoring ergonomics, trait metadata, observers, commands, and a scheduler.

## Architecture

```txt
Game code
  ↓
Bevy-like Roblox-TS API
  ↓
metadata / traits / observers / scheduler / commands
  ↓
jecs world
```

## Non-goals

Do not fork jecs unless absolutely necessary. Wrap; do not rewrite.

## Layered responsibilities

| Layer | Owns |
|-------|------|
| jecs | entity ids, component storage, raw queries, relationships |
| Rovy runtime | `App`, `World` wrapper, `Commands`, scheduler, observer dispatch, event buffers, resources |
| Transformer | trait discovery, manifest generation, macro lowering |
| User code | components (classes), traits (interfaces), systems, observers |

## See also

- [Components](02-components.md)
- [Schedules](07-schedules.md)
- [Transformer](11-transformer.md)
