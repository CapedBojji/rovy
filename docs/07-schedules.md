# Schedules, Sets, Flush

## Schedules

Top-level groups that run in order each step.

```ts
Startup
PreUpdate
Update
PostUpdate
Cleanup
```

`Startup` runs once. The rest run every step.

## Sets

Ordered phases inside a schedule. Each set runs all its systems then flushes.

```ts
app
	.addSystems(Startup, [
		spawnInitialUnits,
	])
	.configureSets(Update, [
		"Clock",
		"Targeting",
		"Movement",
		"Casting",
		"Status",
		"Damage",
		"Death",
		"Cleanup",
	])
	.addSystems(Update, [
		system(incrementBattleClock).inSet("Clock"),

		system(acquireTargets).inSet("Targeting"),

		system(faceTargets).inSet("Movement"),
		system(moveUnits).inSet("Movement"),

		system(startCasts).inSet("Casting"),
		system(updateCasts).inSet("Casting"),
		system(completeCasts).inSet("Casting"),

		system(tickPoison).inSet("Status"),
		system(expireStatuses).inSet("Status"),

		system(processDamageEvents).inSet("Damage"),

		system(processDeaths).inSet("Death"),

		system(cleanupDeadUnits).inSet("Cleanup"),
	]);
```

## Flush semantics

Do not flush after every system by default. Flush at schedule/set boundaries.

```txt
Clock set      → flush
Targeting set  → flush
Movement set   → flush
Casting set    → flush
Status set     → flush
Damage set     → flush
Death set      → flush
Cleanup set    → flush
```

A flush performs:

```txt
1. apply queued commands
2. dispatch queued triggers to observers
3. apply commands produced by observers
4. repeat until no pending commands/triggers
```

Pseudo:

```ts
function flush(world: World) {
	while (world.hasPendingWork()) {
		world.applyCommands();
		world.flushTriggers();
	}
}
```

## Driving the app

Normal use:

```ts
app.step();
```

Manual escape hatch:

```ts
app.flush();
world.flush();
```

## Determinism note

Fixed-order sets + deferred mutation = same input → same output. Required for the battle sim use case.

## See also

- [Commands](04-commands.md)
- [Observers](06-observers.md)
