#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [logFile, stamp, output] = process.argv.slice(2);
if (!logFile || !stamp || !output) throw new Error("Usage: collect-parallel-results.mjs <Studio.log> <build-stamp> <output.json> [--ignore-timing]");
const lines = readFileSync(logFile, "utf8").split("\n");
const prefix = "[FLog::CreatorOutput] ";
let messages = lines.filter((line) => line.includes(prefix)).map((line) => line.slice(line.indexOf(prefix) + prefix.length));
if (!messages.includes(`ROVY_PARALLEL_BUILD ${stamp}`)) throw new Error("Log does not contain the expected build stamp");
// A manually restarted playtest is a new run, even with the same built place.
messages = messages.slice(messages.lastIndexOf(`ROVY_PARALLEL_BUILD ${stamp}`));
const bench = new Map();
const api = new Map();
const faults = new Map();
const timing = new Map();
const failures = [];
for (const message of messages) {
  if (message.startsWith("ROVY_PARALLEL_BENCH ")) {
    const row = JSON.parse(message.slice("ROVY_PARALLEL_BENCH ".length));
    const key = [row.side, row.signal, row.kind, row.rows, row.mode, row.workers, row.chunkSize].join("/");
    // Studio can echo a server log into the client's output; retain one record.
    const previous = bench.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw new Error(`Conflicting benchmark runs for ${key}`);
    bench.set(key, row);
  } else if (message.startsWith("ROVY_PARALLEL_API ")) {
    const payload = message.slice("ROVY_PARALLEL_API ".length);
    api.set(payload, JSON.parse(payload));
  } else if (message.startsWith("ROVY_PARALLEL_FAULTS ")) {
    const match = message.match(/^ROVY_PARALLEL_FAULTS (server|client) (.+)$/);
    if (match) faults.set(match[1], JSON.parse(match[2]));
  } else if (message.startsWith("ROVY_PARALLEL_TIMING_ROW ") && !process.argv.includes("--ignore-timing")) {
    const row = JSON.parse(message.slice("ROVY_PARALLEL_TIMING_ROW ".length));
    timing.set([row.side, row.signal, row.operations, row.rows, row.trial].join("/"), row);
  } else if (/ROVY_PARALLEL_(SERVER|CLIENT)_FAILED/.test(message)) failures.push(message);
}
const result = {
  stamp, sourceLog: resolve(logFile),
  serverOK: messages.includes("ROVY_PARALLEL_SERVER_OK"),
  clientOK: messages.includes("CLIENT ROVY_PARALLEL_CLIENT_OK"),
  failures: [...new Set(failures)], api: [...api.values()],
  faults: Object.fromEntries(faults),
  signals: [...new Set(messages.filter((message) => message.startsWith("ROVY_PARALLEL_SIGNAL ")))],
  timing: [...timing.values()],
  timingExcluded: process.argv.includes("--ignore-timing"),
  benchmarks: [...bench.values()],
};
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ stamp, serverOK: result.serverOK, clientOK: result.clientOK, apiRuns: result.api.length, timingRows: result.timing.length, benchmarkRows: bench.size, failures: result.failures }));
if (!result.serverOK || !result.clientOK || result.failures.length || result.api.length !== 2 ||
    (!result.timingExcluded && result.timing.length !== 80) || (bench.size > 0 && bench.size !== 120)) process.exitCode = 1;
