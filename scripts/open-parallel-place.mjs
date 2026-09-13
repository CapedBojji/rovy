#!/usr/bin/env node
// Launch an already-built snapshot. Building and playtest control stay separate.
import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argument = process.argv[2];
if (!argument || process.platform !== "darwin") {
  throw new Error("Usage on macOS: open-parallel-place.mjs <built test/parallel/.build/*.rbxlx>");
}
const place = realpathSync(resolve(argument));
const output = realpathSync(resolve(root, "test/parallel/.build"));
if (!place.startsWith(output + sep) || !place.endsWith(".rbxlx") || !existsSync(place)) {
  throw new Error("Choose an existing generated parallel test place");
}
const processes = execFileSync("ps", ["-ax", "-o", "pid=,command="], { encoding: "utf8" });
const existing = processes.split("\n").filter((line) =>
  line.includes("/Contents/MacOS/RobloxStudio ") && line.includes(output + sep));
if (existing.length) throw new Error(`A parallel test Studio is already open:\n${existing.join("\n")}`);
execFileSync("open", ["-n", "-a", "/Applications/RobloxStudio.app", "--args", "--task", "EditFile", "--localPlaceFile", place]);
console.log(`Opened ${place}\nVerify its build stamp in Studio before starting play.`);
