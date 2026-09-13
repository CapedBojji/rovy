import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(root, "test/parallel/reports/2026-09-13");

// These committed exports contain only unquoted, scalar CSV fields.
function readCsv(name) {
  const source = readFileSync(resolve(directory, name), "utf8").trim();
  assert(!source.includes('"'), `${name}: quoted fields need a CSV parser`);
  const [header, ...lines] = source.split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    assert.equal(values.length, keys.length, `${name}: invalid column count`);
    return Object.fromEntries(
      keys.map((key, index) => [
        key,
        values[index] === ""
          ? null
          : Number.isFinite(Number(values[index]))
            ? Number(values[index])
            : values[index],
      ]),
    );
  });
}

const benchmarks = readCsv("benchmarks.csv");
const timing = readCsv("timing.csv");
const runs = JSON.parse(readFileSync(resolve(directory, "runs.json"), "utf8"));
assert.equal(benchmarks.length, 480);
assert.equal(timing.length, 320);
assert(
  runs.runs.every(
    (run) => run.serverOK && run.clientOK && run.failures.length === 0,
  ),
);
const unique = new Set();
for (const row of benchmarks) {
  assert(row.p50Ms > 0 && row.p95Ms >= row.p50Ms && row.samples === 20);
  const key = [
    row.signal,
    row.side,
    row.kind,
    row.rows,
    row.mode,
    row.workers,
    row.chunkSize,
  ].join("/");
  assert(!unique.has(key), `Duplicate configuration: ${key}`);
  unique.add(key);
}
for (const row of timing) assert(row.applyTime >= row.submitTime);
const dataDirectory = resolve(root, "docs/.vitepress/data");
const publicDirectory = resolve(root, "docs/public/parallel/2026-09-13");
mkdirSync(dataDirectory, { recursive: true });
mkdirSync(publicDirectory, { recursive: true });
const benchmarkFields = [
  "signal",
  "side",
  "kind",
  "rows",
  "mode",
  "workers",
  "chunkSize",
  "p50Ms",
  "p95Ms",
];
const percentile = (values, fraction) =>
  values.sort((a, b) => a - b)[
    Math.max(0, Math.ceil(values.length * fraction) - 1)
  ];
const timingGroups = [];
for (const side of ["server", "client"])
  for (const signal of ["Deferred", "Immediate"]) {
    for (const rows of [1, 257])
      for (const operations of [1, 10000]) {
        const samples = timing.filter(
          (row) =>
            row.side === side &&
            row.signal === signal &&
            row.rows === rows &&
            row.operations === operations,
        );
        assert.equal(samples.length, 20);
        const times = samples.map(
          (row) => (row.applyTime - row.submitTime) * 1000,
        );
        timingGroups.push({
          side,
          signal,
          rows,
          operations,
          p50Ms: percentile(times, 0.5),
          p95Ms: percentile(times, 0.95),
        });
      }
  }
const data = {
  benchmarks: benchmarks.map((row) =>
    Object.fromEntries(benchmarkFields.map((key) => [key, row[key]])),
  ),
  timing: timingGroups,
  runs,
  measuredSamples: benchmarks.reduce((total, row) => total + row.samples, 0),
  timingSamples: timing.length,
  sameCycle: timing.filter((row) => row.submitFrame === row.applyFrame).length,
};
writeFileSync(
  resolve(dataDirectory, "parallel-report.json"),
  JSON.stringify(data),
);
for (const file of ["benchmarks.csv", "timing.csv", "runs.json"])
  copyFileSync(resolve(directory, file), resolve(publicDirectory, file));
console.log(
  `Built docs graphs from ${benchmarks.length} benchmark configurations and ${timing.length} timing records.`,
);
