---
title: Parallel — Live Results & Graphs
description: Interactive charts of Rovy parallel Actor performance, timing and ECS API verification in Roblox Studio.
aside: false
---

<script setup>
import ParallelResults from '../../.vitepress/components/ParallelResults.vue';
</script>

# Live results & graphs

**The API works. Speed depends on the workload.** Small batches cost more to
send through Actors than to run directly. Some large batches benefit with the
right worker and chunk settings.

Recorded **September 13, 2026**, in separate code-built, unpublished Studio
places. These are completed live runs, not a performance prediction. Choose a
workload below; exact times stay hidden until you want them.

<ParallelResults />

## Reproduce

The fixture builds its own ground plane, systems and worker modules from code.
Build and launch are separate steps; neither uses `run-in-roblox`.

```sh
mise exec -- pnpm build:parallel-place Deferred server --benchmark
# Open the exact place path printed by the build:
mise exec -- pnpm open:parallel-place /absolute/path/from/build.rbxlx
```

Run server/client and Immediate/Deferred variants. Start play after opening the
generated place and verify its build stamp. Preserve unrelated or unsaved places;
do not change an existing game's signal behavior to match a benchmark.

The [fixture README](https://github.com/CapedBojji/rovy/blob/main/test/parallel/README.md)
includes the full matrix and log collector. The
[written verification record](https://github.com/CapedBojji/rovy/blob/main/test/parallel/VERIFICATION.md)
documents instrumentation corrections and limits.

The docs build regenerates these graphs and downloadable records from the
committed CSV files. No external chart service or network request is required.

Continue with the [package guide](/packages/parallel) or
[systems, observers and events example](/packages/parallel/ecs-example).
