import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const placePath = path.resolve(root, "../../build/rovy-zombie-game.rbxl");

assert.ok(fs.existsSync(placePath), "built rbxl missing");
assert.ok(fs.statSync(placePath).size > 0, "built rbxl is empty");

console.log("ok  built rbxl exists");
