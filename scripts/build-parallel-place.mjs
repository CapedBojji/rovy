#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const place = join(root, "test/parallel");
const signal = process.argv[2] ?? "Deferred";
const side = process.argv[3] ?? "server";
if (!["Immediate", "Deferred"].includes(signal) || !["server", "client"].includes(side)) {
  throw new Error("Usage: build-parallel-place.mjs [Immediate|Deferred] [server|client] [--benchmark]");
}
for (const pkg of ["rovy-transformer", "@rovy/parallel", "@rovy/parallel-place"]) {
  execFileSync("pnpm", ["--filter", pkg, "build"], { cwd: root, stdio: "inherit" });
}
const project = JSON.parse(readFileSync(join(place, "default.project.json"), "utf8"));
function absolutePaths(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "$path") value[key] = resolve(place, child);
    else absolutePaths(child);
  }
}
absolutePaths(project);
const stamp = `${Date.now()}-${process.pid}`;
project.tree.$attributes = {
  ParallelBuildStamp: stamp, ParallelSignalMode: signal,
  ParallelProbeSide: side, ParallelBenchmark: process.argv.includes("--benchmark"),
};
project.tree.Workspace.$properties.SignalBehavior = signal;
const output = join(place, ".build");
mkdirSync(output, { recursive: true });
const projectFile = join(output, `${signal}-${side}.project.json`);
writeFileSync(projectFile, JSON.stringify(project, null, 2) + "\n");
const placeFile = join(output, `parallel-${signal}-${side}-${stamp}.rbxlx`);
execFileSync("rojo", ["build", projectFile, "-o", placeFile], { cwd: root, stdio: "inherit" });
console.log(`ROVY_PARALLEL_BUILD ${stamp}\n${placeFile}`);
