const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");

const transformerModule = require("../dist/index.js");
const factory = transformerModule.default ?? transformerModule;

function createFixtureDir() {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rovy-transformer-"));
	const src = path.join(temp, "src");
	fs.mkdirSync(src, { recursive: true });
	fs.writeFileSync(
		path.join(temp, "test.project.json"),
		JSON.stringify({
			name: "fixture",
			tree: {
				$className: "DataModel",
				ReplicatedStorage: {
					game: {
						$path: "out",
					},
				},
			},
		}),
	);
	return { temp, src, rojo: path.join(temp, "test.project.json") };
}

function createProgram(entryPath, rootDir, currentDirectory) {
	const options = {
		target: ts.ScriptTarget.ES2020,
		module: ts.ModuleKind.CommonJS,
		moduleResolution: ts.ModuleResolutionKind.Node10,
		rootDir,
		outDir: path.join(currentDirectory, "out"),
		experimentalDecorators: true,
		strict: true,
		skipLibCheck: true,
		types: [],
	};

	const host = ts.createCompilerHost(options);
	host.getCurrentDirectory = () => currentDirectory;
	return ts.createProgram([entryPath], options, host);
}

function compileFixture(source, options = {}) {
	const { temp, src, rojo } = createFixtureDir();
	const entry = path.join(src, options.fileName ?? "main.ts");
	fs.writeFileSync(entry, source);

	const program = createProgram(entry, src, temp);
	const transformer = factory(program, { rojo, ...(options.config ?? {}) }, { ts });
	const sourceFile = program.getSourceFile(entry);
	assert(sourceFile, "fixture source file missing");

	const result = ts.transform(sourceFile, [transformer]);
	const printed = ts
		.createPrinter({ removeComments: true })
		.printFile(result.transformed[0])
		.replace(/\s+/g, " ");
	const diagnostics = result.diagnostics.map((diag) => String(diag.messageText));

	result.dispose();
	fs.rmSync(temp, { recursive: true, force: true });

	return { printed, diagnostics };
}

function assertNoDiagnostics(result, label) {
	assert.deepEqual(result.diagnostics, [], `${label} emitted diagnostics:\n${result.diagnostics.join("\n")}`);
}

module.exports = {
	assertNoDiagnostics,
	compileFixture,
};
