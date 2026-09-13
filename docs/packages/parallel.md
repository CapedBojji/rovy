# `@rovy/parallel`

Use `@rovy/parallel` when a system has a large amount of calculation work.
For example, you can collect NPC positions, calculate distances in parallel,
and write the results back to components.

The work follows three steps:

1. A **Submit system** copies the inputs from your entities.
2. Roblox **Actors** calculate the results. Each Actor is a worker.
3. An **Apply system** reads the results and updates the entities through `Commands`.

The workers do not read or change your ECS world. They work on the inputs that
you sent them. Rovy reuses the workers and their storage for later work. This is
called **pooling**.

Parallel work has a cost: inputs and results must travel between workers and
your main code. Small calculations can be faster without workers. See the
[live graphs](/packages/parallel/verification) for measured examples.

## Install

Install the package in a project that already uses `@rovy/core` and
`rovy-transformer`:

```sh
npm i @rovy/parallel
```

Keep the package's whole `out` folder in your Rojo mapping. It contains the
server and client worker Scripts. The package clones these Scripts when it
starts a pool; it does not generate Script source during play.

## Terms used in this guide

| Term | Meaning |
| --- | --- |
| Job | A definition of the calculation, its input types and its output type |
| Row | The input values for one entity |
| Batch | A group of rows submitted together |
| Chunk | Part of a batch, sent to one worker |
| Ticket | A number that identifies an accepted batch |
| Drain | Read available results and let the package reuse their storage |
| Barrier | A call that waits for already-submitted work to finish |

## Define a worker

Put the job in its own file, such as `distance-squared.job.ts`. Export it by name.
Import `job` from `@rovy/parallel/worker`; this entry point can be used by workers
without loading the App integration.

This job takes two positions per row and returns their squared distance:

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

`input.columns` has one array for each input field. In this example, all
positions go in the first array and all targets go in the second. The values
at index `i` belong to the same row. This avoids creating an input object for
every entity.

`run` processes one chunk at a time. It must write one output for each input row.
It must finish without waiting. Do not call `task.wait()` or wait for an event
inside it. A function that pauses before it returns is said to **yield**.

### Create state once per worker

Add `setup()` when a worker needs data that it can reuse, such as
`RaycastParams`. The third type argument to `job` specifies the type of this data.
The package passes it to `run(input, output, state)`.

The package calls `setup()` once per worker, before that worker starts parallel
work. `setup()` must also finish without waiting.

Keep data that a worker changes in the object returned by `setup()`. Do not keep
it in module-level variables: Roblox can share a loaded module between Actors.
The job definition itself is frozen and cannot be changed.

Use the method syntax shown above: `run(...) { ... }` and `setup() { ... }`.
roblox-ts uses this syntax to pass the job definition as `self`.

### Job definition rules

Each input tuple must have a fixed number of required fields. An empty tuple
`[]` is allowed. Optional fields and rest fields are not supported.

An input or output value cannot be `undefined` or Luau `nil`. To represent a
missing result, use a value such as `{ found: false }`.

The transformer adds the job ID, module location, export name and input count.
Do not set the internal fields whose names start with `__`.

Keep job modules separate from App startup code and scheduled systems. Local
imports are checked for server/client boundaries and unsupported application
code. These checks cannot prove that third-party code is safe to run in parallel.
For each Roblox API you call from `run`, check that Roblox permits parallel use.

## Submit and consume through ECS

Use two systems: one to submit inputs, and one to apply results. This keeps
worker calculations separate from changes to your world.

The examples below use these components:

- `Position.value` and `Target.value` are `Vector3` values.
- `Distance.value` is a number containing the squared distance.

They also use two schedules you define: `SubmitSensing` and `ApplySensing`.

### Submit inputs

Put this `run` method in a system assigned to `SubmitSensing`. The transformer
injects `JobWriter<typeof DistanceSquared>` for that job.

```ts
run(q: Query<[Entity, Position, Target]>, jobs: JobWriter<typeof DistanceSquared>) {
  const ticket = jobs.tryBatch((batch) => {
    q.forEach((entity, position, target) => {
      batch.push(entity, position.value, target.value);
    });
  });

  // If ticket is undefined, no batch was submitted.
  // Try again on a later update.
}
```

Each `batch.push` adds one entity and its inputs. The entity ID stays in the main
code; the worker receives only the inputs.

`tryBatch` first checks whether the pool is ready and has room. If it cannot
accept a batch, it returns `undefined` without calling your fill function.
Otherwise, it fills the batch and returns a ticket. Keep the ticket if you need
to cancel that batch later.

### Apply results

Put this `run` method in a system assigned to `ApplySensing`:

```ts
run(jobs: JobReader<typeof DistanceSquared>, commands: Commands) {
  jobs.drain((entity, distanceSquared) => {
    commands.set(entity, Distance, new Distance(distanceSquared));
  });
  jobs.drainFailures((failure) => warn(failure.message));
}
```

`drain` calls your function for each available, valid result. It does not wait
for unfinished work. `Commands.set` updates components through Rovy's normal
command handling, so observers and change tracking still work.

Call **both** `drain` and `drainFailures`. Successful and failed batches take up
space until you read them. If you leave either kind unread, the pool can fill
up and reject new submissions.

For a longer example, see
[systems, observers and events](/packages/parallel/ecs-example).

### Start the pool

Add the plugin before you start the App. Then wait for the workers to be ready,
before you run any Submit systems:

```ts
import { App } from "@rovy/core";
import { ParallelPlugin } from "@rovy/parallel";
import { DistanceSquared } from "./distance-squared.job";

const parallel = new ParallelPlugin({ jobs: [DistanceSquared] });
const app = new App();
app.addPlugin(parallel);
app.start();
assert(parallel.ready(5), "Parallel workers failed to start");
```

`ready(5)` waits for worker modules and `setup()` calls to finish. It returns
`false` if startup fails or the wait times out. Call it from your startup code,
not from a Rovy startup system, because it can wait.

One plugin instance belongs to one App. All jobs registered with that plugin
share its pool. Importing the package alone does not create workers.

## Scheduling

Choose when your game needs the answer:

| If your game can… | Use… |
| --- | --- |
| Keep updating while a calculation runs | Background work: read results on later updates |
| Wait before it takes the next step | A barrier: submit, wait, then apply |

### Background work: read results on later updates

On each update, first apply results from earlier submissions. Then submit new
inputs:

```ts
import { RunService } from "@rbxts/services";

RunService.Heartbeat.Connect((dt) => {
  app.runSchedule(ApplySensing, dt);
  app.runSchedule(SubmitSensing, dt);
});
```

For example, update A submits NPC positions. Update B applies the answers if
they are ready, then submits another batch. If the first batch is still running,
Apply returns without those answers and can read them on a later update.

Completed results stay in the pool until you drain them. They do not disappear
at the end of a schedule, unlike Rovy's buffered events.

A newer submission for the same entity and job replaces the older answer. If
you keep submitting faster than the job finishes, old answers can keep being
skipped. Submit less often if you need those answers. See
[which results are applied](#which-results-are-applied).

### Wait for work before the next step

Use `barrier` when Apply must run after the submitted work has finished. The
sequence is:

```ts
app.runSchedule(SubmitSensing, dt);
const outcome = parallel.barrier([DistanceSquared], 0.05);
app.runSchedule(ApplySensing, dt);
if (!outcome.ok) warn(outcome.message);
```

The barrier waits for batches of `DistanceSquared` that the pool had accepted
when the call began. It does not wait for batches submitted after that point.
For example, if batches A and B already exist, the call waits for A and B.
A batch C submitted later does not extend that wait.

The barrier stops waiting for each batch when that batch succeeds, fails or is
cancelled. The barrier returns `ok: true` only if all the batches it waited for succeeded.
Otherwise, it returns `ok: false` and a `message` that describes a failure.

If the wait times out, the package cancels the unfinished batches covered by
that call. Successful batches are still available to `drain`. Cancelled and
failed batches are available to `drainFailures`. **The barrier does not read or
apply results for you.**

### Prevent two waiting steps from overlapping

While a Heartbeat callback waits at a barrier, another Heartbeat can occur.
Use a flag to prevent that second callback from starting another sensing step:

```ts
import { RunService } from "@rbxts/services";

let stepping = false;

RunService.Heartbeat.Connect((dt) => {
  if (stepping) return; // The previous sensing step is still waiting.
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

This example skips sensing on Heartbeats that occur while the previous step is
still waiting. `pcall` catches errors so that the code can clear `stepping` even
if a schedule throws an error.

Choose either this driver or the background driver above. Do not connect both
for the same sensing schedules.

### What a barrier cannot promise

A barrier puts the steps in order: Submit, wait, Apply. It does not promise
that all three finish in the same frame.

Work can finish in the same frame, but Roblox's scheduling and the amount of
work determine that. A timeout also cannot stop a worker in the middle of a
calculation. Treat `0.05` as a timeout request, not an exact wall-clock deadline.

Keep each chunk short, even for background work. Background jobs still use
Roblox's frame time.

### Where waiting is allowed

Call `ready`, `barrier` and low-level `wait` from code outside Rovy's execution
callbacks, as shown in the drivers above.

The plugin rejects these waits inside systems, `runIf`, observers, monitors
and command-flush callbacks. The fill function, worker `setup` and `run`
functions, and result callbacks must also finish without waiting.

Do not start a separate task that keeps using a batch writer or result storage
after its callback has returned. The pool can reuse that storage.

## Ownership and correctness

### Which results are applied

A batch becomes readable only when every chunk succeeds. If any chunk fails,
`drain` does not expose partial results from that batch.

Within a batch, results keep their input order. For each job, batches are read
in submission order. An earlier batch that is still running prevents later
batches from being read.

Before calling your result function, the package skips a row if:

- The entity was deleted. Reusing its numeric ID for a new entity does not make the old result valid.
- A newer batch was accepted for that same entity and job.

Changing a component alone does **not** make a result invalid. For example, a
target can move after you submit a distance calculation. If that matters, send
a revision number with the inputs and return it with the answer. Apply the
answer only if that revision still matches the current target.

### What you can keep after a callback

The pool owns the arrays it gives your callbacks and uses them again later.
This is what **borrowed storage** means.

You can keep scalar outputs such as numbers and booleans directly. If an output
is a table, buffer or another value stored by reference, copy the data you need
before keeping it. This also applies when you put that data in a component.
Copy nested data too if you need to keep it independently.

Do not retain the batch writer or the output array. Use them only inside the
callback that received them.

If a result callback throws, the package still releases that batch's storage.
It does not undo `Commands` that your callback already queued.

### Which inputs are copied

`batch.push` copies plain tables and buffers. Changing the caller's original
table or buffer afterward does not change that row's inputs. Primitive and
Roblox value inputs use column arrays without an extra input object per entity.

`SharedTable` inputs must be frozen so that they cannot change. An `Instance`
input refers to the live Roblox object; it does not copy that object's properties.

Functions, threads, tables that refer back to themselves, and objects with
classes or metatables are not supported as input values.

### Cancel and clean up

Call `parallel.cancel(ticket)` to cancel a batch. Queued work will not start.
If a worker has already started a chunk, it can finish, but the package ignores
its result. That worker is not assigned another chunk until the old one returns.

Call `parallel.destroy()` when you no longer need the App's pool. It releases
the workers and storage, and returns control to code waiting on the pool.
Calling it again is safe. You must arrange this cleanup yourself; the package
does not add an App shutdown event.

## Limits and performance

The pool has fixed limits. It does not create extra workers or grow its batch
storage when it gets full.

| Option | Default | What it controls |
| --- | ---: | --- |
| `workers` | 8 | Number of Actors shared by all registered jobs |
| `chunkSize` | 256 | Most rows sent to one worker at a time |
| `maxBatches` | 8 | Most batches held at once, including unread results and failures |
| `maxRows` | 16384 | Most rows allowed in one batch |
| Job `serialBelow` | 0 | Run batches below this row count in the main code; 0 disables this option |

If `tryBatch` has no free batch slot, it returns `undefined`. If you push more
than `maxRows` into a batch, it throws an error and releases that batch slot.

Each worker processes one chunk at a time. The pool prepares chunks as workers
become available, instead of creating every chunk in advance.

The pool reuses batch records, arrays and worker data. Roblox still copies data
when sending messages, and some operations still allocate memory. Pooling does
not remove every copy or allocation.

### Choose settings by measurement

The defaults are starting values. They do not detect your CPU count or choose
the fastest settings for your game.

The [live graphs](/packages/parallel/verification) compare direct ECS work,
serial execution through this package, and parallel execution. Small batches
were slower in parallel in those tests. Some larger batches benefited.

Measure your own workload before changing the worker count, chunk size or
`serialBelow` threshold. Where in the frame you submit the work also affects
how long you wait for the result.

### Read pool statistics

Use `parallel.stats()` to inspect the pool. It reports batch counts, failures,
cancellations, skipped rows, queued rows and busy workers. `retainedBatches`
includes batches whose results or failures have not yet been read.

`kernelSeconds` adds together the calculation time from completed chunks. Work
can happen on several workers at once, so this total is not the time your game
waited. `dispatchSeconds` measures time spent preparing and sending chunks in
the main code. Use the end-to-end benchmarks to measure the whole wait.

## API at a glance

| API | Use it to… |
| --- | --- |
| `job<Inputs, Output, State>()({...})` | Define a calculation in a `.job.ts` module |
| `new ParallelPlugin({ jobs, ... })` | Add a shared worker pool to one App |
| `parallel.ready(seconds)` | Wait for the workers to start |
| `writer.tryBatch(fill)` | Submit inputs and get a ticket, or `undefined` if the pool cannot accept them |
| `reader.drain(callback)` | Read successful rows and release their batch storage |
| `reader.drainFailures(callback)` | Read failures and release their batch storage |
| `parallel.barrier([Job], seconds)` | Wait for batches accepted before the call |
| `parallel.cancel(ticket)` | Cancel a batch |
| `parallel.stats()` | Read pool counters and timings |
| `parallel.destroy()` | Release the pool when you no longer need it |
| `WorkerPool` | Use jobs directly, without Rovy entities or injected readers and writers |

## Low-level Luau

Use `WorkerPool` if you write Luau by hand or need to manage batches without
Rovy's ECS integration. Require the package's `out/pool` ModuleScript directly.
It does not import core or require roblox-ts RuntimeLib.

You must register each job yourself. Give the pool its ID, ModuleScript,
export name and number of input fields. The job module must export a definition
with a `run` method and, if needed, a `setup` method.

In this example, `pathToParallel` refers to the installed package, and
`DistanceModule` is your job ModuleScript:

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
  print(result.output[1]) -- Read the output while this callback is running.
end)
pool:destroy()
```

`submit` sends the batch. `wait` waits for it. `poll` reads its result and
releases its storage. Luau array indices start at 1.

You can put buffers or frozen SharedTables in input columns for jobs that need
them. Roblox copies buffers when they cross its messaging APIs. Measure these
options before assuming that one is faster.

## Verification

Run the package tests with:

```sh
mise exec -- pnpm test:parallel
```

The separate `test/parallel` fixture includes a code-built Studio place, real
systems and Actors, and NPC/raycast benchmarks. Its README explains how to build
and run it. Unit tests with a simulated transport do not replace live Studio tests.

The live checks on September 13, 2026 covered systems, observers, buffered
events, monitors and failure handling. They ran on both server and client with
Immediate and Deferred signals.

See the [interactive results](/packages/parallel/verification) for the graphs,
test limits and downloadable records. The repository also keeps a written
report at `test/parallel/VERIFICATION.md`.

### Design references

[Weave](https://github.com/artzified/weave),
[ParallelWorker](https://github.com/MaximumADHD/Roblox-Parallel-Worker),
[ActorPool](https://github.com/cameronpcampbell/ActorPool_v4),
[@rbxts/luau-thread](https://www.npmjs.com/package/@rbxts/luau-thread), and the
[Roblox Parallel Luau documentation](https://create.roblox.com/docs/scripting/multithreading)
helped inform the API and worker lifecycle. This package is an independent
implementation.
