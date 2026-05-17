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

// Rovy transformer markers (component / collect / system / query registration).
const rovyChecks = [
	["component registration", /:__component\(/],
	["collect registration", /:__collect\(/],
	["resource registration", /:__resource\(/],
	["system registration", /:__system\(/],
	["query registration", /:__query\(/],
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
assert.doesNotMatch(output, /:__observer\(/, "zombie example should not emit observer registrations");

// Macro / query lowering didn't leak diagnostics into the output.
assert.doesNotMatch(output, /macro reached runtime untransformed/, "raw macro guard leaked into game output");
assert.doesNotMatch(output, /query<\.\.\.>\(\)/, "raw query macro diagnostic leaked into game output");

console.log(`ok  transformed Luau output (${files.length} files)`);
