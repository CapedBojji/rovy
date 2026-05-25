# Getting Started

Rovy is a Bevy-inspired ECS authoring layer for [roblox-ts](https://roblox-ts.com/),
built on [jecs](https://github.com/Ukendio/jecs). It gives you decorator-based
authoring, compile-time queries, traits, events, observers, monitors, commands, and a
custom scheduler.

## Why Rovy?

Writing game logic directly against a raw ECS means manually registering components,
threading queries, and wiring lifecycle hooks. Rovy moves that boilerplate to
build time. You declare intent with decorators; a roblox-ts transformer scans your
code and injects the registration calls the runtime consumes.

| Layer | Owns |
|-------|------|
| jecs | entity ids, component storage, raw queries, relationships, lifecycle hooks |
| Rovy runtime | registries, `app.start()` finalize, `App`, `World` wrapper, `Commands`, scheduler, observer/monitor dispatch, event buffers, resources |
| `rovy-transformer` | decorator scanning, trait discovery, registration-call injection, query hoisting, macro lowering, param injection |
| Your code | `@component` / `@resource` classes, `@event`, traits, `@system` / `@observer` / `@monitor`, `@relation`, `@schedule` |

## The mental model

```txt
Game code
  ↓
Bevy-like Roblox-TS API   (@component, @system, Query<...>, ...)
  ↓
rovy registries / traits / observers / monitors / scheduler / commands
  ↓
jecs world
```

You author against `@rovy/core`. The transformer runs silently during `rbxtsc` and
rewrites decorated classes into `rovy.__*` registration calls. At boot,
`rovy.loadPaths(...)` discovers them and `app.start()` finalizes the world.

## Install

```sh
npm i @rovy/core
npm i -D rovy-transformer
```

Then register the transformer in `tsconfig.json`. Full steps — toolchain, `rovy-build`,
optional packages — are in [Installation](/guide/installation).

## Recommended reading order

Read top to bottom for a first pass; skip around afterward.

1. [Overview](/guide/overview) — goals and architecture.
2. [Components & Resources](/concepts/components) — `@component`, `@resource`, tags.
3. [Queries](/concepts/queries) — `Query<...>` terms, filters, change/added/removed.
4. [Commands](/concepts/commands) — deferred mutations.
5. [Events](/concepts/events) — `@event`, send vs trigger, readers/writers.
6. [Observers](/concepts/observers) — event-only reactions.
7. [Schedules](/concepts/schedules) — custom schedules, sets, flush.
8. [Systems & Injection](/concepts/systems-and-injection) — `@system` + param injection.
9. [Traits](/concepts/traits) and [Trait Runtime](/concepts/trait-runtime).
10. [Monitors](/concepts/monitors) — query-level lifecycle.
11. [Transformer](/runtime/transformer) and [Runtime Lifecycle](/runtime/lifecycle).

## What jecs handles vs. what Rovy adds

**jecs:** entities, components, component storage, raw queries, relationships,
change/add/remove hooks.

**Rovy adds:** decorator-based authoring, interface-based traits, compile-time queries
with param injection, event observers, query-level monitors, commands, custom schedules
and flush points, transformer-injected registration, the collector bridge for external
Roblox/Flamework signals, and the networking and UI packages.

## Next steps

- [Installation](/guide/installation) — full project setup.
- [Your First System](/guide/your-first-system) — a hands-on walkthrough.
- [Examples](/examples/) — runnable example projects.
