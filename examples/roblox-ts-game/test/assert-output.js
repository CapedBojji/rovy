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

assert.ok(fs.existsSync(outDir), "example out/ missing; run rbxtsc first");

const files = walk(outDir);
const output = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

const checks = [
	["component registration", /:__component\(/],
	["system registration", /:__system\(/],
	["observer registration", /:__observer\(/],
	["monitor registration", /:__monitor\(/],
	["query registration", /:__query\(/],
	["trait implementation registration", /:__traitImpl\(/],
	["trait macro lowering", /:traitToken\(/],
	["loadPaths Rojo lowering", /game:GetService\("ReplicatedStorage"\):WaitForChild\("TS"\)/],
];

for (const [label, pattern] of checks) {
	assert.match(output, pattern, `missing ${label}`);
}

assert.doesNotMatch(output, /macro reached runtime untransformed/, "raw macro guard leaked into game output");
assert.doesNotMatch(output, /query<\.\.\.>\(\)/, "raw query macro diagnostic leaked into game output");

console.log(`ok  transformed Luau output (${files.length} files)`);
