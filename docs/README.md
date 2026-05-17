# Rovy — Bevy-like ECS on jecs (docs)

Status: Working draft
Target: Roblox-TS + jecs
Goal: High-level Bevy-inspired ECS authoring layer over jecs as storage/query backend.

## Reading order

Read in order for first pass. Skip around after. For project setup / package split, read [Packages](21-packages.md) right after Overview.

1. [Overview](01-overview.md) — goals, architecture.
2. [Components & Resources](02-components.md) — `@component`, `@resource`, tags.
3. [Queries](03-queries.md) — `Query<...>` terms, filters, change/added/removed.
4. [Commands](04-commands.md) — deferred mutations.
5. [Events](05-events.md) — `@event`, send vs trigger, `EventReader`/`EventWriter`.
6. [Observers](06-observers.md) — event-only reactions.
7. [Schedules](07-schedules.md) — custom schedules, sets, flush.
8. [Traits](08-traits.md) — interface traits, `trait<T>()` macro.
9. [Trait runtime](09-trait-runtime.md) — discovery, query lowering, semantics.
10. [Transformer](10-transformer.md) — duties, registration injection, stable IDs.
11. [Relationships](11-relationships.md) — `@relation`, pairs.
12. [API reference](12-api-reference.md) — full public surface.
13. [Examples](13-examples.md) — combat-system worked examples.
14. [Decisions](14-decisions.md) — locked decisions + open questions.
15. [Roadmap](15-roadmap.md) — implementation order.
16. [Change detection](16-change-detection.md) — `Changed`/`Added`/`Removed` on jecs hooks.
17. [Systems and injection](17-systems-and-injection.md) — `@system` + param injection.
18. [Monitors](18-monitors.md) — query-level lifecycle: `onEnter`/`onExit`/`onChange`.
19. [Compiled output](19-compiled-output.md) — what the transformer emits per construct.
20. [Runtime lifecycle](20-runtime-lifecycle.md) — register → finalize → run; how the runtime uses it all.
21. [Packages](21-packages.md) — `@rovy/core`, `@rovy/networking`, `rovy-transformer`, and setup.
22. [Collectors](22-collectors.md) — external Roblox/Flamework signal translation into systems.
23. [Networking](23-networking.md) — `@netEvent` package, Blink generation plan, and net param injection.
24. [Prefabs](24-prefabs.md) — planned singleton entity-builder surface over `world` and `commands`.

## What jecs handles

- entities
- components
- component storage
- normal queries
- relationships
- change/add/remove hooks

## What this layer adds

- decorator-based authoring (`@component`, `@resource`, `@event`, `@system`, `@observer`, `@monitor`, `@relation`, `@schedule`)
- interface-based traits with transformer-derived metadata
- compile-time queries with param injection
- event observers
- query-level monitors (lifecycle)
- commands
- custom schedules + flush points
- transformer-injected registration (`rovy.__*` side effects + `rovy.loadPaths`)
- collector bridge for external Roblox/Flamework signals
- planned prefab bridge for reusable entity construction
- network-event package (`@netEvent`, `NetClient`, `NetServer`) over generated transport metadata

## Use cases

Any Roblox-TS game that benefits from structured ECS: simulations, combat systems, AI, physics, resource management.
