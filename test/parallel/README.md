# Isolated parallel proof place

This fixture compiles real Rovy systems and `.job.ts` definitions, maps the
published package layout through Rojo, and includes a ground plane for known
raycast results. It does not edit a running game.

## Build matrix

Run from the repository root:

```sh
mise exec -- pnpm build:parallel-place Deferred server
mise exec -- pnpm build:parallel-place Deferred client
mise exec -- pnpm build:parallel-place Immediate server
mise exec -- pnpm build:parallel-place Immediate client
```

Each build prints its unique `ROVY_PARALLEL_BUILD` stamp and place path. Signal
behavior is set in this generated test place, never in an existing game. Open
one generated place with the separate launcher:

```sh
mise exec -- pnpm open:parallel-place /absolute/path/printed/by/build.rbxlx
```

This opens an already-built file; it neither builds nor starts play. It refuses
to open another parallel test Studio while one is already running. No
`run-in-roblox` dependency is used. Verify the stamp on
`ReplicatedStorage.ParallelVerification`, then start a solo playtest with a
client. Preserve unrelated or unsaved places.

Expected markers: `ROVY_PARALLEL_ECS_OK`, `ROVY_PARALLEL_API`, and
`ROVY_PARALLEL_FAULTS` on server and client, 80 `ROVY_PARALLEL_TIMING_ROW`
JSON records on the selected side, and the corresponding
`ROVY_PARALLEL_SERVER_OK` / `ROVY_PARALLEL_CLIENT_OK`. A matching build stamp is
required before associating any result with the current source.

The timing probe warms four workers, submits during PreSimulation, then uses an
event-driven wait. It covers 1/257 rows and 1/10,000 noise operations per row.
Each record includes submission, first worker execution, completion and apply
timestamps, public phase labels, and a counter incremented by `PreSimulation`.
`RunService.FrameNumber` is inaccessible to normal scripts in the tested Studio
version. These are observed simulation-cycle markers, not internal engine frame
IDs. They establish observations for this engine/device configuration, not a
same-frame API guarantee.

## Live API chain

`src/shared/api-proof.ts` runs actual decorated systems, observers, and a monitor:

1. A system snapshots entities into `JobWriter<typeof GroundProbe>`.
2. Pooled Actors raycast. A later system drains results through `JobReader`.
3. `Commands.set` writes components; `commands.trigger` drives observers;
   `EventWriter.send` emits buffered events.
4. A later set in the same Apply schedule reads those buffered events. Sets
   matter: Rovy clears event buffers at the outer schedule boundary.
5. An observer submits a second job type through the same Actor pool. Another
   observer drains it and applies the result through Commands.
6. The test repeats with background sensing and checks dead generations,
   superseded snapshots, component monitor entries, and forbidden waits.

Each side asserts 192 applied results, 192 observer reactions, 192 buffered
events, 192 observer-drained follow-up results, 96 monitor entries, 98 stale
rows skipped, and no retained batch or busy Actor after completion.

`fault-proof.ts` also exercises real worker errors, attempted kernel yields,
late replies after cancellation/timeout, capacity rejection, callback exceptions,
empty batches, large-to-small reuse, and destruction during work. Final success
markers require the package's runtime pool folders to be gone. Unrelated Studio
plugins may own other Actors; those are outside this test's ownership.

## Benchmark sweep

Add `--benchmark` to a build command to run the benchmark after correctness and
timing tests. Only the selected side runs the sweep, avoiding client/server
benchmarks competing on the same host at the same time.

The sweep compares direct serial ECS work, serial package execution, and
parallel execution. It uses 256/2,048/8,192 entities, 1/2/4/8/16/32 workers,
64/256/1024-row chunks, five warmups, and twenty measured samples. Raycast and
NPC-score workloads use identical inputs and arithmetic across modes. Neither
baseline enables native compilation. Output values must equal the direct ECS
baseline after every configuration.

`ROVY_PARALLEL_BENCH` JSON reports p50/p95 end-to-end time, submission/wait/apply
p95, sampled Heartbeat frame time, same-frame rate, heap delta, and pool counters.
Submission includes snapshot and immediate dispatch. Wait includes engine
transfer, queueing, execution, and return scheduling. Kernel CPU duration is a
sum across completed chunks; it cannot be subtracted directly from wall time
to claim exact transport cost. Heap delta is GC-sensitive and is not an exact
allocation count. Use MicroProfiler/heap captures for allocation attribution.

Save raw output with engine version, hardware, signal mode, side, and build
stamp. Report crossover points and slowdowns as well as speedups. Do not claim
that default worker/chunk counts are optimal from a single machine's results.

Collect a completed run from its Studio log:

```sh
node scripts/collect-parallel-results.mjs /path/to/Studio.log BUILD_STAMP .build/results/run.json
```

The collector checks success markers and expected record counts, and starts
from the latest matching build marker if play was restarted. It does not merge
incomplete runs. Timing rows are printed separately to avoid Studio's long-line
truncation. `ROVY_PARALLEL_SIGNAL` verifies actual BindableEvent delivery mode.

## Current evidence

The [dated verification report](VERIFICATION.md) records completed server/client
API, fault, timing, and benchmark runs in Immediate and Deferred modes, with raw
records and build stamps. Deterministic pool tests and compiler/core fixtures
provide additional coverage. Building a new snapshot alone does not establish
that its live checks passed.
