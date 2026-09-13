# Parallel implementation verification — 2026-09-13

Implementation and local checks are complete. Live Actor execution, timing,
and performance measurements remain unverified. Building a place does not prove
the Roblox transport or establish a speedup.

## Passed locally

| Check | Result |
| --- | --- |
| Parallel pool and ECS integration | 25 deterministic tests passed |
| Core, including synchronous execution guards | 141 tests passed |
| Networking, UI, ImGui, Vide, datastore, inspector, Scribe | 400 tests passed |
| Transformer | Case, Blink, and partition suites passed, including source and packaged job injection |
| Build tooling | Existing tests passed |
| Real roblox-ts compilation | Worker definitions, typed injection, both scheduling examples, timing probe, and benchmarks compiled |
| Rojo | Isolated Deferred/server place built with unique source stamp |
| Package | Tarball includes runtime, declarations, worker subpath, and disabled server/client templates |
| Documentation and workspace versions | Documentation build and version consistency checks passed |

The pool suite uses a deterministic transport. It covers chunk remainders,
reordered replies, ordering, empty batches, capacity, snapshot ownership,
errors, cancellation, stale replies, dead entity generations, supersession,
multiple Apps, timeouts, wait guards, callback errors/yields, serial setup
yields, teardown during work/fill, and large-to-small storage reuse.

Commands used from the repository root:

```sh
mise exec -- pnpm test
mise exec -- pnpm test:parallel
mise exec -- pnpm build:parallel-place Deferred server
mise exec -- pnpm docs:build
mise exec -- pnpm check:versions
```

The full existing suite and final parallel suite ran separately; their combined
runtime test count is 566. Compiler/build-tool fixtures are additional checks.
The root test command now includes the parallel suite.

## Live gate and remaining proof

Repository `AGENTS.md` requires the `roblox-studio-rojo-hygiene` skill before
Roblox MCP game testing. That skill was unavailable in the local skill paths
and Studio skill catalog. An unrelated Studio playtest was active. No live
place was changed, opened, or tested; equivalent safeguards were proposed to
the user and await an answer.

After resolving that gate, follow [README.md](README.md) to execute one isolated
place at a time. Verify the build stamp before collecting results. Complete the
server/client × Immediate/Deferred timing matrix and benchmark sweeps. Retain
raw records with engine version and hardware; report p50/p95, same-frame rates,
and crossover points. Use MicroProfiler/heap captures to attribute transfer and
allocation costs; the fixture's heap delta is only an approximate signal.

The completion-order barrier contract remains unchanged regardless of observed
same-frame rates. No universal performance or zero-allocation claim is made.
