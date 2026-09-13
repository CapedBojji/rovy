---
layout: home

hero:
  name: Rovy
  text: Bevy-like ECS for Roblox-TS
  tagline: A decorator-driven authoring layer over jecs — components, systems, events, traits, and schedules with compile-time injection.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Installation
      link: /guide/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/CapedBojji/rovy

features:
  - title: Decorator-based authoring
    details: Declare components, resources, events, systems, observers, monitors, relations, and schedules with TypeScript decorators. The transformer wires registration for you.
  - title: Compile-time queries & injection
    details: Query<...> terms and system parameters are resolved and hoisted at build time, so systems get exactly the data they ask for with zero runtime reflection.
  - title: Interface-based traits
    details: trait<T>() turns plain interfaces into queryable, transformer-derived metadata — polymorphism without class hierarchies.
  - title: Events, observers & monitors
    details: Buffered events with EventReader/EventWriter, event-only observers, and query-level lifecycle monitors (onEnter / onExit / onChange).
  - title: Commands & schedules
    details: Deferred mutations through Commands, custom schedules and system sets, and explicit flush points — ordered, predictable frame logic.
  - title: Pooled parallel jobs
    details: Optional @rovy/parallel batches ECS snapshots across reusable Actors. Typed writers and readers fit systems and observers; live graphs show where parallel work helps.
    link: /packages/parallel
    linkText: Explore parallel jobs
  - title: Optional packages
    details: Optional @rovy/networking adds @netEvent over generated Blink transport; @rovy/scribe adds scheduled typed access to native Scribe player profiles; @rovy/datastore adds Rovy-owned persistent documents; @rovy/vide adds reactive Vide views; @rovy/ui adds retained class-based UI components; @rovy/imgui adds a function-first immediate-mode widget runtime; @rovy/world-inspector adds a live ECS inspection tool.
---

## What is Rovy?

Rovy is a high-level Entity-Component-System authoring layer for
[roblox-ts](https://roblox-ts.com/), built on top of
[jecs](https://github.com/Ukendio/jecs) as its storage and query backend.

jecs handles the low-level mechanics — entity ids, component storage, raw queries,
relationships, and lifecycle hooks. Rovy adds the ergonomic layer on top:
decorator-based authoring, trait metadata, event observers, lifecycle monitors,
commands, and a custom scheduler — a developer experience closer to
[Bevy](https://bevyengine.org/).

```ts
import { RunService } from "@rbxts/services";
import { App, component, schedule, system, Query } from "@rovy/core";

@component
class Position {
  constructor(public x: number, public y: number) {}
}

@component
class Velocity {
  constructor(public dx: number, public dy: number) {}
}

// Rovy ships no built-in schedules — you declare your own.
@schedule
class Update {}

@system({ schedule: Update })
class MoveEntities {
  run(q: Query<[Position, Velocity]>) {
    q.forEach((pos, vel) => {
      pos.x += vel.dx;
      pos.y += vel.dy;
    });
  }
}

const app = new App();
app.start();

RunService.Heartbeat.Connect((dt) => app.runSchedule(Update, dt));
```

## Next steps

- New here? Start with [Getting Started](/guide/getting-started).
- Setting up a project? See [Installation](/guide/installation).
- Want to write code immediately? Follow [Your First System](/guide/your-first-system).
- Learning the model? Browse the [Concepts](/concepts/components) section.
- Moving expensive snapshot work to Actors? Read [Parallel](/packages/parallel) and explore its [live graphs](/packages/parallel/verification).
- Building reactive UI? Read [Rovy Vide](/packages/vide).
- Building retained class-based UI? Read [Rovy UI](/packages/ui).
- Need debug or tool panels? Read [Rovy ImGui](/packages/imgui).
- Need persistence? Read [Datastore](/packages/datastore).
- Already use native Scribe player profiles? Read [Scribe](/packages/scribe).
- Debugging a live world? Read [World Inspector](/packages/world-inspector).
