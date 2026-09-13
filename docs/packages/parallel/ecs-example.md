# Systems, observers & events

Parallel jobs fit into the ordinary Rovy execution loop: a system submits a
snapshot, Actors process it, and a system applies results through `Commands`.
Triggered observers and buffered events then work normally.

This flow passed in the [live verification](/packages/parallel/verification)
on server and client, with both background and explicit-barrier scheduling.
The excerpts below use `GroundProbe` from the
[complete compiled fixture](https://github.com/CapedBojji/rovy/blob/main/test/parallel/src/shared/api-proof.ts).
See the [package guide](/packages/parallel) to define and register a job.

## Worker module

This is the actual worker used by the compiled fixture, included from its source.
Save your job in `ground-probe.job.ts`. It creates raycast parameters once per
worker and writes one boolean result per input row.

<<< ../../../test/parallel/src/shared/ground-probe.job.ts

## Give Apply and event consumption their own sets

Buffered events are cleared at the outer schedule boundary. Read them in a
later set of the **same schedule**, after the Apply set has flushed its commands.
Job results themselves remain available until drained.

```ts
import {
  Commands,
  Entity,
  EventReader,
  EventWriter,
  SystemSet,
  World,
  component,
  event,
  observer,
  schedule,
  set,
  system,
} from "@rovy/core";
import { JobReader } from "@rovy/parallel";
import { GroundProbe } from "./ground-probe.job";

@component
class Sensed {
  constructor(public grounded: boolean) {}
}

@component
class Observed {
  constructor(public grounded: boolean) {}
}

@event
class ProbeApplied {
  constructor(
    public entity: Entity,
    public grounded: boolean,
  ) {}
}

@event
class ProbeBuffered {
  constructor(
    public entity: Entity,
    public grounded: boolean,
  ) {}
}

@schedule
class ApplySensing {}

@set
class ApplyResults extends SystemSet {}

@set
class ConsumeEvents extends SystemSet {}

@system({ schedule: ApplySensing, set: ApplyResults })
class ApplyGroundProbes {
  run(
    probes: JobReader<typeof GroundProbe>,
    commands: Commands,
    events: EventWriter<ProbeBuffered>,
  ) {
    probes.drain((entity, grounded) => {
      commands.set(entity, Sensed, new Sensed(grounded));
      commands.trigger(new ProbeApplied(entity, grounded));
      events.send(new ProbeBuffered(entity, grounded));
    });
    probes.drainFailures((failure) => warn(failure.message));
  }
}

@observer({ event: ProbeApplied })
class ReactToGroundProbe {
  run(result: ProbeApplied, world: World, commands: Commands) {
    // The preceding Commands.set has applied before this event is observed.
    assert(world.get(result.entity, Sensed)?.grounded === result.grounded);
    commands.set(result.entity, Observed, new Observed(result.grounded));
  }
}

@system({ schedule: ApplySensing, set: ConsumeEvents })
class ReadProbeEvents {
  run(events: EventReader<ProbeBuffered>, world: World) {
    events.forEach((result) => {
      // The prior set's flush includes the observer's component write.
      assert(world.get(result.entity, Observed)?.grounded === result.grounded);
    });
  }
}
```

Before `app.start()`, install the plugin and order the sets:

```ts
app.addPlugin(parallel);
app.configureSets(ApplySensing, [ApplyResults, ConsumeEvents]);
app.start();
assert(parallel.ready(5), "Parallel workers failed to start");
```

`GroundProbe` returns a boolean, so the value can be retained directly. Copy
reference-valued outputs before retaining them or inserting them into components.

## Background or explicit barrier

For background sensing, call Apply before Submit in each ordinary update. Apply
consumes whatever has completed. Both schedule calls remain synchronous:

```ts
app.runSchedule(ApplySensing, dt);
app.runSchedule(SubmitSensing, dt);
```

For an explicit dependency, use one serialized outer driver:

```ts
app.runSchedule(SubmitSensing, dt);
const outcome = parallel.barrier([GroundProbe], 0.05);
app.runSchedule(ApplySensing, dt);
if (!outcome.ok) warn(outcome.message);
```

These snippets are alternative steps in your driver. The
[guarded Heartbeat example](/packages/parallel#scheduling) prevents overlapping
steps while a barrier is suspended. A timeout exposes failures; completed
successful batches can still be applied.

## Observers can submit and drain too

`JobWriter<typeof Job>` and `JobReader<typeof Job>` can be injected into
observers. In the live fixture, an observer submits an NPC scoring job through
the same Actor pool. The outer driver waits for those submissions, then triggers
a second observer to drain their results and write components.

Submitting or draining is synchronous. Calling a barrier inside an observer,
system, monitor or flush callback is rejected. Keep the wait in the outer driver.

Component monitors see normal `Commands` writes: the fixture checks that an
`onEnter` callback runs when `Sensed` first appears. Later replacements do not
count as new entries.

## What the live checks prove

- Applied results reached observers and buffered event readers in the expected order.
- Observer-submitted jobs completed and were drained through injected readers.
- Deleted entity generations and superseded snapshots were filtered before callbacks.
- Background delivery and explicit barriers both completed the full chain.
- Pool storage settled after use, and failure paths released their capacity.

The checks do not make arbitrary component mutations automatically invalidate a
snapshot. Include revision data when your job needs to reject results after its
inputs change. See [ownership and correctness](/packages/parallel#ownership-and-correctness).
