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
	writeRovyUiStub(temp);
	return { temp, src, rojo: path.join(temp, "test.project.json") };
}

// The transformer reads the `/** @widget */` JSDoc tag off the resolved
// `@rovy/ui` declaration to decide which built-in calls get a callsite key.
// Fixture temp dirs have no node_modules, so provide a minimal tagged stub
// that mirrors the real package surface.
const ROVY_UI_WIDGETS = [
	"window", "button", "checkbox", "slider", "input", "label", "heading",
	"separator", "row", "space", "portal", "radioButton", "selectableLabel",
	"comboBox", "dragValue", "progressBar", "collapsingHeader", "toggle",
	"clickableLabel", "modal", "popup", "childWindow", "table", "tableRow",
	"tableCell", "demoWindow",
];

function writeRovyUiStub(temp) {
	const dir = path.join(temp, "node_modules", "@rovy", "ui");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "package.json"),
		JSON.stringify({ name: "@rovy/ui", version: "0.0.0", types: "index.d.ts" }),
	);
	const lines = [
		"export interface Style { [key: string]: unknown; }",
		"export interface StyleScopeOptions { patch: Partial<Style>; discriminator?: string | number; }",
		"export declare function scope<T>(fn: () => T): T;",
		"export declare function StyleScope<T>(options: StyleScopeOptions, fn: () => T): T;",
		"export declare function withStyleScope<T>(options: StyleScopeOptions, fn: () => T): T;",
		"export declare function useState<T>(initial: T): [T, (next: T) => void];",
		"export declare function useEffect(fn: () => void, ...deps: unknown[]): void;",
		"export declare function useInstance<T>(creator: (ref: Record<string, unknown>) => unknown): T;",
	];
	for (const name of ROVY_UI_WIDGETS) {
		lines.push(`/** @widget */`);
		lines.push(`export declare const ${name}: (...args: any[]) => any;`);
	}
	const objectMembers = ROVY_UI_WIDGETS.map((name) => `${name}: typeof ${name};`).join(" ");
	lines.push(`declare const RovyUi: { ${objectMembers} };`);
	lines.push("export default RovyUi;");
	fs.writeFileSync(path.join(dir, "index.d.ts"), lines.join("\n") + "\n");
}

function createProgram(entryPaths, rootDir, currentDirectory) {
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
	return ts.createProgram(entryPaths, options, host);
}

function compileFixture(source, options = {}) {
	const { temp, src, rojo } = createFixtureDir();
	const entry = path.join(src, options.fileName ?? "main.ts");
	const rootNames = [];
	for (const [name, contents] of Object.entries(options.files ?? {})) {
		const filePath = path.join(src, name);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, contents);
		rootNames.push(filePath);
	}
	fs.mkdirSync(path.dirname(entry), { recursive: true });
	fs.writeFileSync(entry, source);
	rootNames.push(entry);
	if (options.rovyConfig) {
		fs.writeFileSync(path.join(temp, ".rovy.json"), JSON.stringify(options.rovyConfig, null, 2));
	}
	if (options.packageRovyBuild) {
		fs.writeFileSync(
			path.join(temp, "package.json"),
			JSON.stringify({ name: "fixture", "rovy-build": options.packageRovyBuild }, null, 2),
		);
	}

	const program = createProgram(rootNames, src, temp);
	const transformer = factory(
		program,
		options.rovyConfig
			? { config: ".rovy.json", ...(options.config ?? {}) }
			: { rojo, ...(options.config ?? {}) },
		{ ts },
	);
	const sourceFile = program.getSourceFile(entry);
	assert(sourceFile, "fixture source file missing");

	const result = ts.transform(sourceFile, [transformer]);
	const printed = ts
		.createPrinter({ removeComments: true })
		.printFile(result.transformed[0])
		.replace(/\s+/g, " ");
	const diagnostics = result.diagnostics.map((diag) => String(diag.messageText));

	result.dispose();
	if (!options.keepTemp) {
		fs.rmSync(temp, { recursive: true, force: true });
	}

	return { printed, diagnostics, temp, src, rojo };
}

function assertNoDiagnostics(result, label) {
	assert.deepEqual(result.diagnostics, [], `${label} emitted diagnostics:\n${result.diagnostics.join("\n")}`);
}

module.exports = {
	assertNoDiagnostics,
	compileFixture,
};
