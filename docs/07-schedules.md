# Schedules, Sets, Flush

> **Compile-time.** `@schedule` decorator and `@system({ schedule: X })` references are read by the transformer, which injects a `rovy.__schedule` side-effect call after the class. Set ordering is declared via `app.configureSets`. The library provides no built-in schedules — all schedules are user-defined.

## Defining schedules

```ts
@schedule
class Startup {}

@schedule
class Update {}

@schedule
class Physics {}

@schedule
class Cutscene {}
```

## Wiring to Roblox loop

```ts
app.start(); // fires all @schedule({ runOnStart: true }) once

RunService.Heartbeat.Connect((dt) => {
	world.runSchedule(Update);
	world.runSchedule(Physics);
});

// conditional
if (inCutscene) {
	world.runSchedule(Cutscene);
}
```

`app.start()` is just a convenience for one-shot schedules. Equivalent to calling `world.runSchedule(Startup)` yourself.

## One-shot schedules

Mark `runOnStart: true` to fire automatically on `app.start()`:

```ts
@schedule({ runOnStart: true })
class Startup {}
```

Or fire manually:

```ts
world.runSchedule(Startup);
```

## Deferred schedule run

From inside a system or observer:

```ts
commands.runSchedule(Physics);
```

Runs at next flush.

## Sets

Ordered phases inside a schedule. Flush runs after each set.

```ts
app.configureSets(Update, [
	InputSet,
	MovementSet,
	CombatSet,
	CleanupSet,
]);

app.configureSets(Physics, [
	BroadphaseSet,
	NarrowphaseSet,
	ResolutionSet,
]);
```

Systems register into a set:

```ts
@system({ schedule: Update, set: MovementSet })
class MoveUnits { ... }

@system({ schedule: Physics, set: ResolutionSet })
class ResolveCollisions { ... }
```

Sets are classes extending `SystemSet`. See [Systems and injection](17-systems-and-injection.md#sets).

## Flush semantics

Flush runs after every set — not after every system.

```txt
Set A systems run
  → flush (apply commands, dispatch triggers, repeat until empty)
Set B systems run
  → flush
...
```

Flush algorithm:

```ts
function flush(world: World) {
	while (world.hasPendingWork()) {
		world.applyCommands();
		world.flushTriggers();
	}
}
```

Fixed-order sets + deferred mutation = same input → same output. Essential for deterministic simulations.

## StandardPlugin (optional)

Ships as a separate optional plugin. Adds common schedules and wires `app.step()` to drive them:

```ts
app.addPlugin(StandardPlugin);

// now available:
// Startup (runOnStart: true)
// PreUpdate, Update, PostUpdate, Cleanup
// app.step(dt) drives PreUpdate → Update → PostUpdate → Cleanup
```

Not included by default. Zero built-ins in the core library.

## Manual flush escape hatch

```ts
app.flush();
world.flush();
```

## Registration

Transformer injects a side-effect call after each `@schedule` class:

```ts
class Startup {}
rovy.__schedule(Startup, { runOnStart: true });

class Update {}
rovy.__schedule(Update, { runOnStart: false });
```

`rovy.loadPaths(...)` makes these run; `app.start()` builds the schedule objects and fires `runOnStart` ones. See [Compiled output](19-compiled-output.md).

## See also

- [Commands](04-commands.md)
- [Observers](06-observers.md)
- [Systems and injection](17-systems-and-injection.md)
