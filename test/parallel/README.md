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
one generated place, verify the stamp, and run a solo playtest with a client.
Follow repository Studio hygiene first. Preserve unrelated or unsaved places.

Expected markers: `ROVY_PARALLEL_ECS_OK` on server and client, a
`ROVY_PARALLEL_TIMING` JSON record on the selected side, and the corresponding
`ROVY_PARALLEL_SERVER_OK` / `ROVY_PARALLEL_CLIENT_OK`. A matching build stamp is
required before associating any result with the current source.

The timing probe warms four workers, submits during PreSimulation, then uses an
event-driven wait. It covers 1/257 rows and 1/10,000 noise operations per row.
Each record includes submission, first worker execution, completion and apply
timestamps and `RunService.FrameNumber` values. These establish observations
for this engine/device configuration, not a same-frame API guarantee.

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

## Current evidence

The package has deterministic fake-transport tests, compiler fixtures, core
execution-guard tests, and a buildable Roblox place. Live results belong in a
dated report only after the matching place actually executes. No numeric live
timing or speedup result is implied by building this fixture.
