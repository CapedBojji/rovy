# `@rovy/parallel`

Pooled parallel Luau jobs for Rovy. Query systems gather values into column
arrays, Actors process chunks, and ordinary systems apply the results through
`Commands`. A worker never receives the live ECS world or its component objects.

Install `@rovy/parallel` alongside `@rovy/core` and enable `rovy-transformer`.
The package includes disabled server/client worker templates; preserve its `out`
tree in your Rojo mapping. No Script source is generated during play.

## Define a worker

Use a named exported constant in a `.job.ts` module. Import the worker-only
entry point. It does not install application extensions.

```ts
import { job } from "@rovy/parallel/worker";

export const DistanceSquared = job<[Vector3, Vector3], number>()({
  run(input, output) {
    const [positions, targets] = input.columns;
    for (let i = 0; i < input.count; i++) {
      const delta = targets[i].sub(positions[i]);
      output[i] = delta.Dot(delta);
    }
  },
});
```

`setup()` optionally creates state once per Actor in serial context and must
return without yielding. The third
type argument describes that state; `run(input, output, state)` receives it.
Use method syntax as shown: roblox-ts preserves its `self` convention. The
definition is frozen. Keep mutable state in `setup` results, not module globals.
Modules can be cached by VM, so module globals are not guaranteed Actor-local.

The transformer supplies the module, export name, input arity, and stable ID.
Do not author the internal `__` fields. Fixed required tuples are supported,
including `[]`. Optional/rest tuple entries are rejected. Runtime input/output
values must not be nil; use a tagged value to represent absence.

## Submit and consume through ECS

```ts
run(q: Query<[Entity, Position, Target]>, jobs: JobWriter<typeof DistanceSquared>) {
  const ticket = jobs.tryBatch((batch) => {
    q.forEach((entity, position, target) => {
      batch.push(entity, position.value, target.value);
    });
  });
  // undefined means not ready or at capacity. The fill callback did not run.
}
```

```ts
run(jobs: JobReader<typeof DistanceSquared>, commands: Commands) {
  jobs.drain((entity, distanceSquared) => {
    commands.set(entity, Distance, new Distance(distanceSquared));
  });
  jobs.drainFailures((failure) => warn(failure.message));
}
```

Install before startup:

```ts
const parallel = new ParallelPlugin({ jobs: [DistanceSquared] });
app.addPlugin(parallel);
app.start();
assert(parallel.ready(5), "workers failed to start");
```

Always wait for readiness before starting submission schedules. Startup systems
cannot call `ready()` because it can yield. No Actors are created merely by
importing this package.

## Scheduling

For background work, run the Apply schedule before Submit on each update.
Completed batches remain available until drained; they are not ephemeral ECS
events. Always drain failures as well as successes to release capacity.

For an explicit dependency, run Submit, call `parallel.barrier([Job], seconds)`,
then run Apply. The barrier captures submissions accepted before the call;
future submissions do not extend it. Both successful and failed captured
batches settle the barrier. Failure returns `{ok: false, message}`.

```ts
let stepping = false;
RunService.Heartbeat.Connect((dt) => {
  if (stepping) return; // Explicit policy: skip overlapping sensing steps.
  stepping = true;
  const [ok, failure] = pcall(() => {
    app.runSchedule(SubmitSensing, dt);
    const outcome = parallel.barrier([DistanceSquared], 0.05);
    app.runSchedule(ApplySensing, dt);
    if (!outcome.ok) warn(outcome.message);
  });
  stepping = false;
  if (!ok) warn(failure);
});
```

The barrier guarantees completion order, not completion in the current engine
frame. Roblox permits multiple serial/parallel transitions in one frame, but
engine scheduling and work duration decide the actual latency. A timeout cannot
preempt unyielding Luau and is not a hard frame deadline. Kernels must remain
short even when consumers use background scheduling.

The plugin enables core guards that reject waits inside systems, `runIf`,
observers, monitors, and flush callbacks. Fill, kernel, poll, and drain callbacks
must not yield. They must not schedule detached work that retains borrowed
storage. Applications must serialize their own outer step driver.

## Ownership and correctness

- `tryBatch` pools input columns and entity mappings. Each push copies plain
  table/buffer values, avoiding later caller mutation. Primitive/Roblox value
  columns do not allocate one input table per entity.
- Actors receive chunks, not entity handles. Complete generation-bearing entity
  IDs stay on the main thread. Dead generations and results superseded by a
  newer accepted entity/job submission are skipped at drain time.
- A changed component without a newer submission is not automatically stale.
  For target selection, for example, include the target revision in the inputs
  and returned data; compare it with the current revision before queuing writes.
- Only complete successful batches publish output. Batches retain row order and
  deliver in submission order per job. A slow earlier batch blocks later ones.
- Output references are borrowed for the drain/poll callback. Copy values you
  retain or insert by reference into components. Scalar results can be retained
  directly. Retaining the batch writer or output array is unsupported.
- Errors release pooled storage even if application callbacks throw. Commands
  already queued by an application callback are not rolled back.
- `cancel(ticket)` removes queued work and suppresses running work's late
  results. Busy Actors remain quarantined until their chunk returns; their
  scratch is never handed to another job early.
- `destroy()` is idempotent and wakes blocked waits. Call it when the owning App
  is discarded. This package does not add a global App shutdown lifecycle.

`SharedTable` inputs must be frozen. Instances refer to live engine objects;
they are not snapshots of Instance properties. Functions, threads, cyclic
tables, and class/metatable-bearing input objects are rejected. Workers still
must obey the engine's thread-safety tags. The compiler checks local job imports
for application declarations and boundary violations; it cannot prove arbitrary
third-party code thread-safe.

## Limits and performance

| Option | Default | Meaning |
| --- | ---: | --- |
| `workers` | 8 | Fixed Actor count, shared across registered jobs |
| `chunkSize` | 256 | Maximum rows in one worker message |
| `maxBatches` | 8 | Maximum accepted, undrained batches |
| `maxRows` | 16384 | Maximum rows per batch; exceeding it throws and releases the reservation |
| Job `serialBelow` | 0 | Run smaller batches locally; disabled by default |

The bounded queue contains batches; chunk descriptors are generated lazily.
Workers process one chunk at a time. A pool does not grow automatically. Public
tickets are numbers; internal records, column arrays, worker scratch, and output
arrays are reused. Copies made by Roblox messaging and coroutine/callback
allocations still exist: this is not a zero-allocation or zero-copy claim.

`stats()` returns submission/failure/cancellation counters, stale row count,
retained batch count, queued rows, busy workers, dispatched chunks, cumulative
kernel seconds across workers, and serial dispatch seconds. Kernel seconds are
summed CPU durations, not wall latency. Defaults are starting points for
measurement, not hardware core detection or universally optimal settings.

## Low-level Luau

Require `@rovy/parallel/out/pool` directly if no roblox-ts RuntimeLib is installed.
The low-level module has no core import. Provide explicit worker registrations;
their modules export a definition with a `run` method, optional `setup` method,
and fixed input count supplied by the registration.

```luau
local WorkerPool = require(pathToParallel.out.pool).WorkerPool
local pool = WorkerPool.new({
  jobs = {{ id = "distance", module = DistanceModule, exportName = "Distance", inputCount = 2 }},
  workers = 4,
})
assert(pool:ready(5))
local ticket = pool:submit("distance", {
  columns = {{Vector3.zero}, {Vector3.new(1, 2, 3)}}, count = 1,
})
assert(ticket and pool:wait(ticket, 1).ok)
pool:poll(ticket, function(result)
  print(result.output[1]) -- Borrowed until this callback returns.
end)
pool:destroy()
```

Buffers or frozen SharedTables can occupy columns for specialized bulk jobs.
Buffers are copied across Roblox APIs. Use explicit worker setup to hold
reusable state; do not assume shared memory is always faster than copied columns.

## Verification

`mise exec -- pnpm test:parallel` runs deterministic pool and ownership tests.
`test/parallel` contains compiled ECS examples, an isolated Actor timing probe,
and NPC/raycast benchmark sweeps. See its README for reproducible commands and
the distinction between static proof, fake-transport tests, and live Actor proof.

Design references: [Weave](https://github.com/artzified/weave),
[ParallelWorker](https://github.com/MaximumADHD/Roblox-Parallel-Worker),
[ActorPool](https://github.com/cameronpcampbell/ActorPool_v4),
[@rbxts/luau-thread](https://www.npmjs.com/package/@rbxts/luau-thread), and
[Roblox Parallel Luau](https://create.roblox.com/docs/scripting/multithreading).
The implementation is independent; these references informed API and lifecycle design.
