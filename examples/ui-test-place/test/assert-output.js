import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outDir = path.join(root, "out");

function walk(dir) {
	const files = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walk(full));
		} else if (entry.isFile() && entry.name.endsWith(".luau")) {
			files.push(full);
		}
	}
	return files;
}

assert.ok(fs.existsSync(outDir), "ui-test-place out/ missing; run build first");

const files = walk(outDir);
const output = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

const checks = [
	["client render loop", /RenderStepped/],
	["screen gui", /RovyUiTestPlace/],
	["demo window usage", /demoWindow/],
	["shared module", /Rovy UI Test Place/],
];

for (const [label, pattern] of checks) {
	assert.match(output, pattern, `missing ${label}`);
}

console.log(`ok  ui test place output (${files.length} files)`);
