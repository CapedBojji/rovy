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
const mainClient = fs.readFileSync(path.join(outDir, "client", "main.client.luau"), "utf8");

const checks = [
	["client render loop", /RenderStepped/],
	["screen gui", /RovyUiTestPlace/],
	["curve editor widget", /curveEditor/],
	["curve path scoped widget", /curvePath/],
	["viewport frame widget", /viewportFrame/],
	["viewport item scoped widget", /viewportItem/],
	["ui labs demo story", /Demo Window/],
	["ui labs curve editor story", /Infinite Canvas/],
	["ui labs viewport frame story", /Viewport Frame/],
	["ui labs viewport free camera story", /Ctrl\+Shift click/],
	["ui labs portal story", /Portal Proof/],
	["ui labs portal deleted target branch", /external target was deleted/],
	["portal widget usage", /portal/],
	["ui labs generic story", /use = "Generic"/],
	["ui labs injected input", /inputService = createRovyInputServiceFromSignals/],
	["shared module", /Rovy UI Test Place/],
];

for (const [label, pattern] of checks) {
	assert.match(output, pattern, `missing ${label}`);
}

assert.match(mainClient, /viewportFrame/, "playtest client should mount viewportFrame");
assert.match(mainClient, /viewportItem/, "playtest client should mount viewportItem");
assert.match(mainClient, /Ctrl\+Shift click/, "playtest client should explain single-click viewport capture");
assert.doesNotMatch(mainClient, /demoWindow/, "playtest client should not mount demoWindow");
assert.doesNotMatch(mainClient, /curveEditorPlayground/, "playtest client should not mount curveEditorPlayground");
assert.doesNotMatch(mainClient, /curvePath/, "playtest client should not mount curvePath");

console.log(`ok  ui test place output (${files.length} files)`);
