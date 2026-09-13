<script setup>
import { computed, ref } from "vue";
import { withBase } from "vitepress";
import ParallelBars from "./ParallelBars.vue";
import data from "../data/parallel-report.json";

const side = ref("server"),
  signal = ref("Deferred"),
  kind = ref("npc"),
  metric = ref("p50Ms"),
  numbers = ref(false);
const sizes = [256, 2048, 8192],
  names = ["Small batch", "Medium batch", "Large batch"];
const modes = [
  "Direct ECS",
  "Package, serial",
  "Parallel defaults",
  "Best-median parallel",
];
const styles = ["direct", "serial", "default", "best"];
const selected = computed(() =>
  data.benchmarks.filter(
    (r) =>
      r.side === side.value &&
      r.signal === signal.value &&
      r.kind === kind.value,
  ),
);
const groups = computed(() =>
  sizes.map((size, index) => {
    const rows = selected.value.filter((r) => r.rows === size);
    const best = rows
      .filter((r) => r.mode === "parallel")
      .sort((a, b) => a.p50Ms - b.p50Ms)[0];
    const entries = [
      rows.find((r) => r.mode === "direct"),
      rows.find((r) => r.mode === "serial-package"),
      rows.find(
        (r) => r.mode === "parallel" && r.workers === 8 && r.chunkSize === 256,
      ),
      best,
    ];
    return {
      name: names[index],
      size,
      best,
      direct: entries[0],
      faster: best[metric.value] < entries[0][metric.value],
      bars: entries.map((r, i) => ({
        label: modes[i],
        style: styles[i],
        value: r[metric.value],
      })),
    };
  }),
);
const maximum = computed(
  () =>
    Math.max(...groups.value.flatMap((g) => g.bars.map((r) => r.value))) * 1.06,
);
const large = computed(() => groups.value[2]);
const sweep = computed(() =>
  [1, 2, 4, 8, 16, 32].map((workers) => ({
    workers,
    cells: [64, 256, 1024].map((chunk) => {
      const row = selected.value.find(
        (r) =>
          r.rows === 8192 &&
          r.mode === "parallel" &&
          r.workers === workers &&
          r.chunkSize === chunk,
      );
      return {
        chunk,
        value: row[metric.value],
        faster: row[metric.value] < large.value.direct[metric.value],
      };
    }),
  })),
);
const timing = computed(() =>
  ["Deferred", "Immediate"].map((mode) => ({
    mode,
    bars: data.timing
      .filter((r) => r.side === side.value && r.signal === mode)
      .map((r) => ({
        label:
          (r.rows === 1 ? "Single row" : "Chunked batch") +
          " · " +
          (r.operations === 1 ? "light work" : "heavy work"),
        value: r[metric.value],
        style: mode === "Immediate" ? "best" : "direct",
      })),
  })),
);
const timingMaximum = computed(
  () =>
    Math.max(
      1000 / 60,
      ...timing.value.flatMap((g) => g.bars.map((r) => r.value)),
    ) * 1.08,
);
const allApi = data.runs.runs.flatMap((r) => r.api);
const apiPassed =
  data.runs.runs.every(
    (r) => r.serverOK && r.clientOK && r.failures.length === 0,
  ) &&
  allApi.every(
    (a) =>
      a.applied === 192 &&
      a.observers === 192 &&
      a.bufferedEvents === 192 &&
      a.observerResults === 192 &&
      a.monitorEntries === 96 &&
      a.guardChecks === 293 &&
      a.stats.staleRows === 98 &&
      a.stats.retainedBatches === 0 &&
      a.stats.busyWorkers === 0,
  );
const faults = data.runs.runs
  .filter((r) => r.faults)
  .flatMap((r) => Object.values(r.faults));
const checks = [
  ["Stale entities rejected", allApi.every((a) => a.stats.staleRows === 98)],
  ["Wait guards enforced", allApi.every((a) => a.guardChecks === 293)],
  [
    "Kernel errors handled",
    faults.length === 4 && faults.every((f) => f.kernelErrors === 2),
  ],
  [
    "Cancellation + timeout",
    faults.length === 4 && faults.every((f) => f.cancellationAndTimeout === 2),
  ],
  [
    "Capacity limits",
    faults.length === 4 && faults.every((f) => f.exhaustion === 1),
  ],
  [
    "Callback errors",
    faults.length === 4 && faults.every((f) => f.callbackErrors === 1),
  ],
  [
    "Pool reuse + teardown",
    faults.length === 4 &&
      faults.every((f) => f.reuse && f.destructionDuringWork),
  ],
];
const flow = [
  ["Submit system", "Snapshots ECS inputs into pooled columns."],
  ["Pooled Actors", "Process chunks and return complete batches."],
  ["Apply system", "Drains results and writes through Commands."],
  [
    "Observers + events",
    "React to changes; a later set reads buffered events.",
  ],
  [
    "Follow-up job",
    "An observer submits; another drains after an external barrier.",
  ],
];
</script>

<template>
  <div class="parallel-report">
    <div class="status" :class="{ passed: apiPassed }">
      {{
        apiPassed ? "✓ Live API checks passed" : "API evidence needs review"
      }}
      · Server + client · Both signal modes
    </div>
    <h2 id="performance" tabindex="-1">
      Is parallel faster?
      <a
        class="header-anchor"
        href="#performance"
        aria-label="Permalink to performance"
      />
    </h2>
    <p class="lead">
      Shorter bars mean less waiting. Total time includes the snapshot,
      transfer, job, application and ECS flushes.
    </p>
    <div class="controls">
      <label
        >Workload<select v-model="kind">
          <option value="npc">NPC sensing</option>
          <option value="raycast">Raycasts</option>
        </select></label
      >
      <label
        >Runs on<select v-model="side">
          <option value="server">Server</option>
          <option value="client">Client</option>
        </select></label
      >
      <label
        >Signal delivery<select v-model="signal">
          <option>Deferred</option>
          <option>Immediate</option>
        </select></label
      >
      <label class="statistic"
        >Compare<select v-model="metric">
          <option value="p50Ms">Typical run · median</option>
          <option value="p95Ms">Slower runs · p95</option>
        </select></label
      >
      <label class="checkbox"
        ><input v-model="numbers" type="checkbox" /> Show exact times</label
      >
    </div>
    <div class="legend">
      <span v-for="(label, index) in modes" :key="label"
        ><i :class="styles[index]" />{{ label }}</span
      >
    </div>
    <div class="comparison">
      <article v-for="group in groups" :key="group.size">
        <div class="size">
          <h3>{{ group.name }}</h3>
          <span>{{ group.size.toLocaleString() }} rows</span>
        </div>
        <p class="verdict" :class="{ good: group.faster }">
          {{
            group.faster
              ? "↘ Best-median parallel takes less time"
              : "↗ Best-median parallel takes more time"
          }}
        </p>
        <ParallelBars
          :rows="group.bars"
          :maximum="maximum"
          :numbers="numbers"
        />
      </article>
    </div>
    <p class="caption">
      All three sizes share one scale. Defaults use 8 workers and 256-row
      chunks. “Best” selects the lowest median from the sweep; p95 shows that
      same configuration’s slower runs.
    </p>
    <div class="takeaway" aria-live="polite">
      <strong>{{
        large.faster
          ? "The large batch shows a possible parallel gain."
          : "The best-median setting still loses on this comparison."
      }}</strong>
      <span v-if="metric === 'p50Ms'"
        >No tested parallel setting beats direct ECS at either smaller batch
        size.
      </span>
      <span v-else
        >This view shows slower runs; the winner is still selected by median.
      </span>
      The large-batch sweep winner uses {{ large.best.workers }} workers and
      {{ large.best.chunkSize }} rows per chunk.
    </div>
    <details>
      <summary>Explore all worker settings for the large batch</summary>
      <p>
        Each cell compares parallel with direct ECS for the chosen filters and
        statistic. Differences are observations, not proof of a repeatable gain.
      </p>
      <div
        class="sweep"
        role="table"
        aria-label="Large batch worker and chunk sweep"
      >
        <div class="sweep-row" role="row">
          <span role="columnheader">Workers</span
          ><span
            v-for="chunk in [64, 256, 1024]"
            :key="chunk"
            role="columnheader"
            >{{ chunk }} / chunk</span
          >
        </div>
        <div
          v-for="row in sweep"
          :key="row.workers"
          class="sweep-row"
          role="row"
        >
          <span role="rowheader">{{ row.workers }}</span
          ><span
            v-for="cell in row.cells"
            :key="cell.chunk"
            class="cell"
            :class="{ good: cell.faster }"
            role="cell"
            :aria-label="`${row.workers} workers, ${cell.chunk} rows per chunk: ${cell.value.toFixed(2)} ms, ${cell.faster ? 'less' : 'more'} time than direct ECS`"
            >{{ cell.faster ? "↘ Less time" : "↗ More time"
            }}<small v-if="numbers">{{ cell.value.toFixed(2) }} ms</small></span
          >
        </div>
      </div>
      <p class="caption">
        {{ kind === "npc" ? "NPC sensing" : "Raycasts" }} · {{ side }} ·
        {{ signal }} · {{ metric === "p50Ms" ? "median" : "p95" }} · 8,192 rows
      </p>
    </details>

    <h2 id="ecs-proof" tabindex="-1">
      Does it fit Rovy?
      <a
        class="header-anchor"
        href="#ecs-proof"
        aria-label="Permalink to ECS proof"
      />
    </h2>
    <p>
      A complete ECS loop passed with both background and explicit-barrier
      scheduling.
    </p>
    <ol class="flow">
      <li v-for="[title, description] in flow" :key="title">
        <span class="tick" aria-hidden="true">✓</span
        ><strong>{{ title }}</strong
        ><span>{{ description }}</span>
      </li>
    </ol>
    <div class="checks">
      <span v-for="[label, ok] in checks" :key="label"
        >{{ ok ? "✓" : "✕" }} {{ label }}</span
      >
    </div>
    <p class="caption">
      Events are consumed in a later set of the same schedule. Waits stay
      outside systems, observers, monitors and flush callbacks.
    </p>
    <p>
      <a :href="withBase('/packages/parallel/ecs-example')"
        >Read the systems, observers and events example →</a
      >
    </p>

    <h2 id="timing" tabindex="-1">
      Can it finish this cycle?
      <a
        class="header-anchor"
        href="#timing"
        aria-label="Permalink to timing"
      />
    </h2>
    <p v-if="data.sameCycle === data.timingSamples">
      Every measured timing probe applied in the same observed simulation cycle.
      Heavy work still exceeded a typical frame budget.
    </p>
    <p v-else>
      {{ data.sameCycle }} of {{ data.timingSamples }} timing probes applied in
      the same observed simulation cycle.
    </p>
    <p class="caption">
      <i class="budget-key" /> Dashed line: one 60 fps frame’s time budget.
    </p>
    <div class="timing-grid">
      <article v-for="group in timing" :key="group.mode">
        <h3>{{ group.mode }}</h3>
        <ParallelBars
          :rows="group.bars"
          :maximum="timingMaximum"
          :numbers="numbers"
          budget
        />
      </article>
    </div>
    <p class="caption">
      {{ side === "server" ? "Server" : "Client" }} ·
      {{ metric === "p50Ms" ? "Typical run · median" : "Slower runs · p95" }}.
      Both signal modes share one scale. Light/heavy: 1/10,000 noise operations
      per row. Chunked batches: 257 rows. Dashed line: 16.67 ms. The side and
      statistic controls above also update these graphs.
    </p>
    <div class="takeaway">
      <strong>A barrier guarantees order, not a frame deadline.</strong>These
      probes start at PreSimulation. The benchmark sweep starts at Heartbeat, so
      the measurements include different scheduling positions.
    </div>

    <h2 id="evidence" tabindex="-1">
      Evidence & limits
      <a
        class="header-anchor"
        href="#evidence"
        aria-label="Permalink to evidence"
      />
    </h2>
    <p>
      An unrelated Studio playtest and existing plugins stayed active. Treat
      these as observations from this machine under background load. Small
      differences can be noise; “best in sweep” is exploratory.
    </p>
    <details>
      <summary>Method, hardware and recorded counts</summary>
      <p>
        Studio {{ data.runs.engine }} · {{ data.runs.hardware.model }} ·
        {{ data.runs.hardware.logicalCores }} logical cores ·
        {{ data.runs.hardware.memoryGiB }} GiB RAM.
      </p>
      <p>
        {{ data.benchmarks.length }} benchmark configurations,
        {{ data.measuredSamples.toLocaleString() }} measured benchmark samples,
        five warmups per configuration. {{ data.timingSamples }} timing samples,
        twenty per timing group. All benchmark outputs matched the direct ECS
        baseline.
      </p>
      <p>
        Each API run applied 192 results, invoked 192 observers, consumed 192
        buffered events, drained 192 follow-up results, observed 96 monitor
        entries, checked 293 wait guards and skipped 98 stale rows. No batches
        or busy workers remained after settling.
      </p>
      <p>
        Workloads used matching inputs and arithmetic. Neither baseline enabled
        native compilation. Twenty measured samples and selection from a sweep
        can favor noise. Heap deltas depend on garbage collection and are not
        allocation counts; summed worker CPU time is not wall time.
      </p>
      <p>
        Timing uses public PreSimulation cycle markers, not internal engine
        frame IDs or rendered-frame deadlines. Invalid preliminary timing was
        excluded and rerun. These graphs use the accepted records only.
      </p>
    </details>
    <div class="downloads">
      <a
        v-for="[name, file] in [
          ['Benchmark CSV', 'benchmarks.csv'],
          ['Timing CSV', 'timing.csv'],
          ['Run manifests', 'runs.json'],
        ]"
        :key="file"
        :href="withBase('/parallel/2026-09-13/' + file)"
        download
        >{{ name }}</a
      >
    </div>
  </div>
</template>

<style scoped>
.parallel-report {
  --parallel-direct: #626acb;
  --parallel-serial: #8a95a6;
  --parallel-default: #c9753e;
  --parallel-best: #218d79;
  --good: var(--vp-c-green-1);
  --bad: var(--vp-c-yellow-1);
  color: var(--vp-c-text-1);
}
.status {
  padding: 12px 15px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  font-size: 13px;
}
.status.passed {
  color: var(--good);
}
.lead {
  color: var(--vp-c-text-2);
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 20px;
  padding: 18px 0 22px;
}
.controls label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}
.controls select {
  appearance: auto;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 8px 9px;
  min-height: 40px;
}
.controls .checkbox {
  flex-direction: row;
  align-items: center;
  align-self: end;
  gap: 8px;
  min-height: 40px;
  font-weight: 400;
}
.checkbox input {
  accent-color: var(--parallel-direct);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 18px;
  font-size: 12px;
  color: var(--vp-c-text-2);
  margin-bottom: 23px;
}
.legend span {
  display: flex;
  gap: 6px;
  align-items: center;
}
.legend i {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--parallel-direct);
}
.legend .serial {
  background: var(--parallel-serial);
}
.legend .default {
  background: var(--parallel-default);
}
.legend .best {
  background: var(--parallel-best);
}
.comparison {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px;
}
.size {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  flex-wrap: wrap;
}
.size h3 {
  margin: 0;
  font-size: 17px;
  line-height: 1.4;
}
.size span {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.parallel-report .verdict {
  font-size: 12px;
  line-height: 1.6;
  color: var(--bad);
  margin: 9px 0 17px;
  min-height: 38px;
}
.parallel-report .good {
  color: var(--good);
}
.parallel-report .caption {
  font-size: 12px;
  color: var(--vp-c-text-2);
  line-height: 1.7;
}
.takeaway {
  background: var(--vp-c-bg-soft);
  border-left: 3px solid var(--parallel-direct);
  padding: 15px 19px;
  margin: 22px 0;
  font-size: 14px;
}
.takeaway strong {
  display: block;
  margin-bottom: 4px;
}
details {
  border-top: 1px solid var(--vp-c-divider);
  padding: 15px 0 0;
  margin: 24px 0;
}
summary {
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
details p {
  font-size: 13px;
}
.sweep {
  display: grid;
  gap: 6px;
  margin-top: 19px;
}
.sweep-row {
  display: grid;
  grid-template-columns: 62px repeat(3, minmax(0, 1fr));
  gap: 6px;
  align-items: center;
  text-align: center;
  font-size: 12px;
}
.sweep-row [role="rowheader"] {
  text-align: left;
}
.sweep-row [role="columnheader"] {
  color: var(--vp-c-text-2);
}
.cell {
  padding: 8px 4px;
  background: var(--vp-c-yellow-soft);
  color: var(--bad);
  border-radius: 5px;
}
.cell.good {
  background: var(--vp-c-green-soft);
}
.cell small {
  display: block;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.parallel-report .flow {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 15px;
  list-style: none;
  padding: 0;
  margin: 23px 0;
}
.flow li {
  position: relative;
  margin: 0;
  padding: 12px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
}
.flow li:not(:last-child):after {
  content: "→";
  position: absolute;
  right: -14px;
  top: 43px;
  color: var(--vp-c-text-2);
}
.flow strong {
  display: block;
  font-size: 13px;
  margin-bottom: 5px;
}
.flow .tick {
  display: block;
  color: var(--good);
  margin-bottom: 7px;
}
.flow li > span:last-child {
  color: var(--vp-c-text-2);
}
.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 9px 18px;
  font-size: 13px;
}
.checks span {
  color: var(--good);
}
.timing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 26px;
}
.timing-grid h3 {
  margin: 0 0 20px;
  font-size: 17px;
}
.budget-key {
  display: inline-block;
  height: 12px;
  border-left: 2px dashed var(--vp-c-text-2);
  vertical-align: -2px;
  margin-right: 6px;
}
.downloads {
  display: flex;
  flex-wrap: wrap;
  gap: 9px 22px;
  margin: 22px 0;
  font-size: 13px;
}
.parallel-report :is(select, input, summary):focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}
@media (max-width: 767px) {
  .comparison {
    grid-template-columns: 1fr;
    gap: 28px;
  }
  .parallel-report .verdict {
    min-height: 0;
  }
  .parallel-report .flow {
    grid-template-columns: 1fr;
  }
  .flow li {
    padding: 13px 16px;
  }
  .flow .tick {
    float: right;
    margin: 0;
  }
  .flow li:not(:last-child):after {
    content: "↓";
    top: auto;
    bottom: -21px;
    right: 50%;
  }
  .timing-grid {
    grid-template-columns: 1fr;
  }
  .controls {
    gap: 12px;
  }
  .controls label {
    flex: 1;
    min-width: 120px;
  }
  .controls select {
    font-size: 16px;
  }
  .controls .statistic {
    flex-basis: 100%;
  }
  .sweep-row {
    grid-template-columns: 48px repeat(3, minmax(0, 1fr));
    font-size: 11px;
  }
}
</style>
