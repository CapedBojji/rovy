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

assert.ok(fs.existsSync(outDir), "zombie-game out/ missing; run rbxtsc first");

const files = walk(outDir);
const output = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

// Rovy transformer markers (component / system / observer / query registration).
const rovyChecks = [
	["component registration", /:__component\(/],
	["resource registration", /:__resource\(/],
	["system registration", /:__system\(/],
	["observer registration", /:__observer\(/],
	["query registration", /:__query\(/],
	["event registration", /:__event\(/],
	["schedule registration", /:__schedule\(/],
	["loadPaths Rojo lowering", /game:GetService\("ReplicatedStorage"\):WaitForChild\("TS"\)/],
];
for (const [label, pattern] of rovyChecks) {
	assert.match(output, pattern, `missing Rovy ${label}`);
}

// Flamework networking lowering must produce some recognisable artifact.
// The exact string depends on the Flamework transformer; we look for the
// Networking.createEvent surface that ends up in the compiled module.
assert.match(output, /Networking|createEvent|GlobalEvents/, "missing Flamework networking output");

// Macro / query lowering didn't leak diagnostics into the output.
assert.doesNotMatch(output, /macro reached runtime untransformed/, "raw macro guard leaked into game output");
assert.doesNotMatch(output, /query<\.\.\.>\(\)/, "raw query macro diagnostic leaked into game output");

console.log(`ok  transformed Luau output (${files.length} files)`);
