# Rovy — Bevy-like ECS on jecs (docs)

Status: Working draft
Target: Roblox-TS + jecs
Goal: High-level Bevy-inspired ECS authoring layer over jecs as storage/query backend.

## Reading order

Read in order for first pass. Skip around after.

1. [Overview](01-overview.md) — goals, architecture.
2. [Components](02-components.md) — components, tags, resources.
3. [Queries](03-queries.md) — entity term, filters, optional, change/added.
4. [Commands](04-commands.md) — deferred mutations.
5. [Events](05-events.md) — send vs trigger, world vs commands.
6. [Observers](06-observers.md) — event + lifecycle observers.
7. [Schedules](07-schedules.md) — schedules, sets, flush semantics.
8. [Traits](08-traits.md) — trait authoring, `implements` rule.
9. [Trait runtime](09-trait-runtime.md) — discovery, query lowering, semantics.
10. [Trait observers](10-trait-observers.md) — trait lifecycle.
11. [Transformer](11-transformer.md) — duties, manifest, stable IDs.
12. [Relationships](12-relationships.md) — jecs relationship wrapper.
13. [API reference](13-api-reference.md) — full public surface.
14. [Examples](14-examples.md) — battle components/events/flow.
15. [Decisions](15-decisions.md) — locked decisions.
16. [Open questions](16-open-questions.md) — unresolved.
17. [Roadmap](17-roadmap.md) — next work items.
18. [Change detection](18-change-detection.md) — how `.changed/.added/.removed` work on jecs hooks.
19. [Systems and injection](19-systems-and-injection.md) — `System` class + transformer-driven param injection.

## What jecs handles

- entities
- components
- component storage
- normal queries
- relationships
- change/add/remove detection where available

## What this layer adds

- class-based component authoring
- interface-based traits
- transformer-derived trait metadata
- trait queries
- observers
- lifecycle observers
- commands
- schedules
- flush points
- events/triggers

## Primary use case

Deterministic server-side battle ECS for an auto-battler.
