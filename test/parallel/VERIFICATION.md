# Live parallel verification — 2026-09-13

Server/client API, failure handling, and timing checks passed in separate code-built test places. All 480 benchmark configurations finished and matched their direct serial ECS output baseline. No package runtime change was required during this verification.

## Evidence

- Engine: Roblox Studio `0.737.0.7371584`; Mac17,8, 18 logical cores, 48 GiB RAM.
- Timing matrix: server/client × Immediate/Deferred; 20 measured samples for each of four workloads, 320 timing records total.
- Benchmark matrix: two workloads × three row counts × twenty configurations × four side/signal combinations; 480 configurations and 9,600 measured samples, plus five warmups per configuration.
- Every API run applied 192 results, invoked 192 observers, consumed 192 buffered events, drained 192 observer-submitted results, observed 96 component entries, checked 293 wait guards, and skipped 98 stale rows.
- Real Actor fault checks passed on server/client in both signal modes: kernel error, attempted yield, cancellation, zero-timeout cancellation, exhaustion, callback error, empty batch, storage reuse, and destruction during work.
- Final test entry points assert that the package-owned runtime folders are gone. A separate VFX Studio plugin owns an unrelated Actor; it is excluded from pool cleanup checks.
- Package deterministic suite: 25 tests passed again. Earlier core/workspace runtime verification: 541 additional tests passed; compiler, package, and docs checks were recorded in the implementation commit.

Raw records: [timing.csv](reports/2026-09-13/timing.csv), [benchmarks.csv](reports/2026-09-13/benchmarks.csv), and [run manifests](reports/2026-09-13/runs.json). Each record carries its source build stamp.

## Timing

Submission runs inside a public `PreSimulation` callback after its cycle marker updates. Workers read a side-local Instance marker. Completion and Apply record the same counter plus phase labels. These are observed simulation cycles, not internal engine frame IDs or rendered-frame deadlines.

| Signal | Side | Rows | Noise operations/row | Same cycle | p50 ms | p95 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Deferred | client | 1 | 1 | 20/20 | 0.154 | 2.022 |
| Deferred | client | 1 | 10000 | 20/20 | 0.413 | 0.471 |
| Deferred | client | 257 | 1 | 20/20 | 16.451 | 16.955 |
| Deferred | client | 257 | 10000 | 20/20 | 22.441 | 23.302 |
| Deferred | server | 1 | 1 | 20/20 | 0.149 | 0.245 |
| Deferred | server | 1 | 10000 | 20/20 | 0.543 | 0.683 |
| Deferred | server | 257 | 1 | 20/20 | 16.564 | 17.018 |
| Deferred | server | 257 | 10000 | 20/20 | 23.789 | 24.534 |
| Immediate | client | 1 | 1 | 20/20 | 0.160 | 1.064 |
| Immediate | client | 1 | 10000 | 20/20 | 0.443 | 0.549 |
| Immediate | client | 257 | 1 | 20/20 | 0.495 | 0.696 |
| Immediate | client | 257 | 10000 | 20/20 | 22.166 | 22.942 |
| Immediate | server | 1 | 1 | 20/20 | 0.144 | 0.172 |
| Immediate | server | 1 | 10000 | 20/20 | 0.434 | 0.506 |
| Immediate | server | 257 | 1 | 20/20 | 0.438 | 0.531 |
| Immediate | server | 257 | 10000 | 20/20 | 20.120 | 20.956 |

Heavy batches can finish in the same observed cycle while exceeding a 16.7 ms budget. The barrier guarantees completion order, not a frame deadline. Public phase meanings follow [Roblox’s task scheduler documentation](https://create.roblox.com/docs/performance-optimization/microprofiler/task-scheduler).

## End-to-end benchmark results

Times include snapshot, scheduling/transfer, kernel, result application, and ECS flushes. Default parallel means eight workers and 256-row chunks. The best median is selected from the sweep and is exploratory, not a recommended universal setting.

Benchmarks submit from `Heartbeat`; the timing probe submits inside
`PreSimulation`. Their latency numbers include different scheduling positions.
Even Immediate-mode Heartbeat submissions often took roughly 16 ms in this
fixture. Signal mode alone does not determine end-to-end latency.

| Signal | Side | Workload | Rows | Direct p50/p95 ms | Serial package p50/p95 ms | Default parallel p50/p95 ms | Best parallel p50 ms (workers/chunk) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Deferred | client | npc | 256 | 0.766/0.923 | 0.952/1.175 | 16.186/17.548 | 15.909 (2/1024) |
| Deferred | client | npc | 2048 | 7.060/8.205 | 6.857/7.113 | 16.082/20.382 | 16.082 (8/256) |
| Deferred | client | npc | 8192 | 25.953/29.277 | 26.717/27.246 | 32.368/34.976 | 22.795 (8/1024) |
| Deferred | client | raycast | 256 | 0.662/0.768 | 0.750/0.849 | 16.573/16.933 | 16.170 (8/64) |
| Deferred | client | raycast | 2048 | 5.675/6.719 | 6.066/6.725 | 16.344/23.732 | 16.063 (32/64) |
| Deferred | client | raycast | 8192 | 39.566/42.323 | 36.044/38.293 | 32.074/35.096 | 22.997 (8/1024) |
| Deferred | server | npc | 256 | 0.731/0.799 | 0.837/0.935 | 16.400/17.343 | 16.225 (16/1024) |
| Deferred | server | npc | 2048 | 6.166/7.050 | 6.600/7.090 | 16.378/17.289 | 16.378 (8/256) |
| Deferred | server | npc | 8192 | 24.678/25.509 | 25.373/26.491 | 32.272/34.858 | 22.735 (8/1024) |
| Deferred | server | raycast | 256 | 0.695/0.836 | 0.836/1.168 | 16.525/16.773 | 16.198 (8/64) |
| Deferred | server | raycast | 2048 | 5.555/5.989 | 5.746/6.013 | 16.475/17.338 | 16.197 (4/1024) |
| Deferred | server | raycast | 8192 | 22.759/25.639 | 22.410/23.473 | 31.984/32.907 | 22.199 (32/1024) |
| Immediate | client | npc | 256 | 0.825/0.990 | 0.893/1.175 | 16.448/17.133 | 16.280 (32/64) |
| Immediate | client | npc | 2048 | 5.830/6.177 | 6.505/6.956 | 16.293/21.042 | 15.876 (4/256) |
| Immediate | client | npc | 8192 | 25.166/26.918 | 25.832/26.874 | 23.702/28.607 | 23.331 (16/256) |
| Immediate | client | raycast | 256 | 0.645/0.797 | 0.745/0.826 | 16.421/17.215 | 16.138 (16/1024) |
| Immediate | client | raycast | 2048 | 6.166/7.051 | 5.638/6.524 | 16.393/20.376 | 15.806 (32/1024) |
| Immediate | client | raycast | 8192 | 22.908/26.117 | 27.809/31.761 | 33.098/38.653 | 23.174 (32/1024) |
| Immediate | server | npc | 256 | 0.714/0.788 | 0.829/0.920 | 16.530/16.928 | 16.312 (16/1024) |
| Immediate | server | npc | 2048 | 6.174/6.528 | 6.387/6.590 | 16.503/16.902 | 16.383 (1/1024) |
| Immediate | server | npc | 8192 | 25.105/26.243 | 25.971/26.744 | 22.960/24.725 | 21.724 (8/1024) |
| Immediate | server | raycast | 256 | 0.685/0.745 | 0.788/0.955 | 16.416/17.080 | 16.255 (8/1024) |
| Immediate | server | raycast | 2048 | 5.295/5.647 | 5.693/7.256 | 16.483/17.533 | 16.310 (4/1024) |
| Immediate | server | raycast | 8192 | 22.312/22.706 | 22.223/23.436 | 22.060/23.294 | 21.795 (4/1024) |

At 256 and 2,048 rows, no tested parallel configuration beat direct serial work
on median end-to-end time. Some configurations crossed over by 8,192 rows;
others still lost. That places possible crossover regions between the tested
sizes, rather than establishing an exact threshold. Use workload-specific
measurements and the optional `serialBelow` threshold. Do not change a game’s
signal mode solely to reproduce these results.

## Limits and corrections

- An unrelated user-owned Studio playtest remained active. Existing Studio plugins also ran. These are same-host observations under that background load, not isolated hardware performance claims.
- Heap deltas are GC-sensitive; they are not allocation counts. Kernel seconds sum work across workers and cannot be subtracted from wall time to infer exact transfer cost.
- A separate MicroProfiler capture was saved under `.build/results/server-profile*`. Its summary marked itself partial (an open stack at capture end); no profiler aggregate is used for the quantitative conclusions above.
- Initial instrumentation incorrectly used DataModel-root attributes, inaccessible `RunService.FrameNumber`, and a signal Wait that resumed before the counter callback. The final fixture uses a serialized verification Folder, public callback markers, and per-row log records. Invalid preliminary timing was excluded; the Deferred server timing pass was rebuilt and rerun.
- The API fixture initially tried consuming buffered events in a later schedule. Core correctly clears them at the schedule boundary. The final example uses ordered Apply/Consume sets within one schedule.
- Collection starts at the last matching build marker, excluding interrupted/restarted partial runs.

## Reproduce

See [README.md](README.md) for separate build, open, play, and collection steps. The build never launches Studio, and neither workflow uses `run-in-roblox`. Test places remain unpublished.
