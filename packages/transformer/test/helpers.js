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
	writeRovyRetainedUiStub(temp);
	writeRovyVideStub(temp);
	writeRbxtsTStub(temp);
	return { temp, src, rojo: path.join(temp, "test.project.json") };
}

// The transformer reads the `/** @widget */` JSDoc tag off the resolved
// `@rovy/imgui` declaration to decide which built-in calls get a callsite key.
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
	const dir = path.join(temp, "node_modules", "@rovy", "imgui");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "package.json"),
		JSON.stringify({ name: "@rovy/imgui", version: "0.0.0", types: "index.d.ts" }),
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

function writeRovyRetainedUiStub(temp) {
	const dir = path.join(temp, "node_modules", "@rovy", "ui");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "package.json"),
		JSON.stringify({ name: "@rovy/ui", version: "0.0.0", types: "index.d.ts" }),
	);
	fs.writeFileSync(
		path.join(dir, "index.d.ts"),
		[
			"export type Props<T extends object = {}> = Readonly<T>;",
			"export type UiNode = unknown;",
			"export declare function ui(ctor: new (...args: never[]) => object): void;",
			"export declare function mountUi(app: unknown, root: unknown, options?: unknown): unknown;",
			"export declare function child<TProps extends object>(ctor: new (props: Props<TProps>) => { render(...args: unknown[]): UiNode }, props?: TProps, options?: unknown): UiNode;",
			"export declare function native(className: string, props?: Record<string, unknown>, children?: unknown, options?: unknown): UiNode;",
			"export declare function fragment(children?: unknown, options?: unknown): UiNode;",
			"export declare function portal(target: Instance, children?: unknown, options?: unknown): UiNode;",
			"export declare function frame(props?: Record<string, unknown>, children?: unknown): UiNode;",
			"export declare function screenGui(props?: Record<string, unknown>, children?: unknown): UiNode;",
			"export declare function billboardGui(props?: Record<string, unknown>, children?: unknown): UiNode;",
			"export declare function surfaceGui(props?: Record<string, unknown>, children?: unknown): UiNode;",
			"export declare function textLabel(props?: Record<string, unknown>, children?: unknown): UiNode;",
			"export declare function textButton(props?: Record<string, unknown>, children?: unknown): UiNode;",
			"export declare function $prop<T = unknown>(key: string): unknown;",
			"export declare function $queryTrigger<Terms extends ReadonlyArray<unknown>, F1 = void, F2 = void, F3 = void, F4 = void, F5 = void>(options?: unknown): unknown;",
			"export declare function $componentTrigger(ctor: unknown, options?: unknown): unknown;",
			"export declare function $resourceTrigger(ctor: unknown): unknown;",
			"export declare function $eventTrigger(ctor: unknown): unknown;",
			"export declare function $relationTrigger(ctor: unknown, options?: unknown): unknown;",
			"export declare function $lifecycleTrigger(kind: string, options?: unknown): unknown;",
			"export declare const rovyUi: { __ui(ctor: unknown, meta: unknown): void; };",
			"declare const RovyUi: typeof rovyUi & { child: typeof child; native: typeof native; fragment: typeof fragment; };",
			"export default RovyUi;",
			"export namespace JSX { interface Element {} interface IntrinsicElements { [name: string]: Record<string, unknown>; } }",
		].join("\n") + "\n",
	);
}

// The transformer injects `@rbxts/t` into consumer files for document and
// runtime-type-check validators, and now reports when it cannot resolve. The
// fixtures declare documents, so the module has to exist on disk here too.
function writeRbxtsTStub(temp) {
	const dir = path.join(temp, "node_modules", "@rbxts", "t");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "package.json"),
		JSON.stringify({ name: "@rbxts/t", version: "3.2.1", types: "index.d.ts" }),
	);
	fs.writeFileSync(path.join(dir, "index.d.ts"), "export declare const t: Record<string, any>;\n");
}

function writeRovyVideStub(temp) {
	const dir = path.join(temp, "node_modules", "@rovy", "vide");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "package.json"),
		JSON.stringify({ name: "@rovy/vide", version: "0.0.0", types: "index.d.ts" }),
	);
	fs.writeFileSync(
		path.join(dir, "index.d.ts"),
		[
			"export interface ViewContext { query<T = unknown>(handle: string): unknown; events<T = unknown>(eventCtor: unknown, options?: unknown): unknown; }",
			"export interface ViewMonitor<T = unknown, F1 = unknown, F2 = unknown, F3 = unknown, F4 = unknown, F5 = unknown> {}",
			"export declare function view(options?: unknown): (ctor: new (...args: never[]) => object) => void;",
			"export declare const rovyVide: { __view(ctor: unknown, meta: unknown): void; };",
		].join("\n") + "\n",
	);
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
		if (/\.tsx?$/.test(name)) {
			rootNames.push(filePath);
		}
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
