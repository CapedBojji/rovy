const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const transformerModule = require("../dist/index.js");
const transformerFactory = transformerModule.default ?? transformerModule;
const { preparePartitionedProject } = transformerModule;

function fixture(source) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "rovy-partition-"));
	const src = path.join(root, "src");
	const plugin = path.join(src, "plugins", "combat");
	fs.mkdirSync(plugin, { recursive: true });
	fs.writeFileSync(path.join(plugin, ".rovy.plugin.json"), "{}\n");
	fs.writeFileSync(path.join(plugin, "index.ts"), 'export { ClientTick, ServerTick, SharedClock } from "./runtime";\n');
	fs.writeFileSync(path.join(plugin, "runtime.ts"), source);
	fs.writeFileSync(
		path.join(root, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				experimentalDecorators: true,
				module: "commonjs",
				moduleResolution: "node",
				noLib: true,
				rootDir: "src",
				outDir: "out",
				skipLibCheck: true,
			},
			include: ["src"],
		}),
	);
	return root;
}

function writeCoreStub(root) {
	const packageDir = path.join(root, "node_modules", "@rovy", "core");
	fs.mkdirSync(packageDir, { recursive: true });
	fs.writeFileSync(
		path.join(packageDir, "package.json"),
		JSON.stringify({ name: "@rovy/core", types: "index.d.ts" }),
	);
	fs.writeFileSync(
		path.join(packageDir, "index.d.ts"),
		[
			"export declare function shared(target: object): void;",
			"export declare function client(target: object): void;",
			"export declare function server(target: object): void;",
			"export declare function plugin(target: object): void;",
			"export declare function system(options: object): (target: object) => void;",
		].join("\n"),
	);
}

{
	const root = fixture(`
declare function shared(target: object): void;
declare function client(target: object): void;
declare function server(target: object): void;
declare function component(target: object): void;
declare function system(options: object): (target: object) => void;
declare class Update {}

const bothSides = () => 42;

@shared
@component
export class SharedClock {
\tvalue = bothSides();
}

@client
@system({ schedule: Update })
export class ClientTick {
\trun() { return bothSides(); }
}

@server
@system({ schedule: Update })
export class ServerTick {
\trun() { return bothSides(); }
}
`);
	const prepared = preparePartitionedProject(root);
	assert(prepared, "fixture should be partitioned");
	const plugin = path.join(prepared.stagingRoot, "plugins", "combat");
	const sharedSource = fs.readFileSync(path.join(plugin, "shared", "runtime.ts"), "utf8");
	const clientSource = fs.readFileSync(path.join(plugin, "client", "runtime.ts"), "utf8");
	const serverSource = fs.readFileSync(path.join(plugin, "server", "runtime.ts"), "utf8");
	assert.match(sharedSource, /bothSides/);
	assert.match(sharedSource, /class SharedClock/);
	assert.doesNotMatch(sharedSource, /class ClientTick/);
	assert.match(clientSource, /class ClientTick/);
	assert.equal(clientSource.includes('from "../shared/runtime"'), true);
	assert.match(serverSource, /class ServerTick/);
	const configFile = ts.readConfigFile(prepared.projectFile, ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(
		configFile.config,
		ts.sys,
		path.dirname(prepared.projectFile),
	);
	const generatedProgram = ts.createProgram(parsed.fileNames, parsed.options);
	assert.deepEqual(
		generatedProgram
			.getSyntacticDiagnostics()
			.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
		[],
	);

	const pluginOut = path.join(root, "out", "plugins", "combat");
	fs.mkdirSync(pluginOut, { recursive: true });
	fs.writeFileSync(path.join(pluginOut, "runtime.luau"), "return {}\n");
	prepared.finalize();
	assert.equal(fs.existsSync(path.join(pluginOut, "runtime.luau")), false);
	const facade = fs.readFileSync(path.join(pluginOut, "init.luau"), "utf8");
	assert.match(facade, /RunService:IsClient/);
	assert.match(facade, /if game then/);
	assert.doesNotMatch(facade, /local RunService = game:GetService/);
	const manifest = JSON.parse(fs.readFileSync(path.join(pluginOut, ".rovy-boundaries.json"), "utf8"));
	assert.deepEqual(manifest.exports, {
		ClientTick: "client",
		ServerTick: "server",
		SharedClock: "shared",
	});
	fs.rmSync(root, { recursive: true, force: true });
}

{
	const root = fixture(`
declare function netEvent(options: object): (target: object) => void;
declare function netFunction(options: object): (target: object) => void;
declare function scribeEvent(options: object): (target: object) => void;
declare function scribeCommand(options: object): (target: object) => void;
declare function client(target: object): void;
declare function system(options: object): (target: object) => void;
declare class Update {}

@netEvent({ direction: "clientToServer" })
export class SharedMessage {}

@netFunction({ direction: "clientToServer", result: SharedResult })
export class SharedRequest {}

export class SharedResult {}

@scribeEvent({ data: {}, kind: "ready" })
export class SharedScribeEvent {}

@scribeCommand({ data: {}, result: SharedResult })
export class SharedScribeCommand {}

@client
@system({ schedule: Update })
class ClientConsumer {
\trun() { return new SharedMessage(); }
}
`);
	fs.writeFileSync(
		path.join(root, "src", "plugins", "combat", "index.ts"),
		'export { SharedMessage, SharedRequest, SharedResult, SharedScribeEvent, SharedScribeCommand } from "./runtime";\n',
	);
	const prepared = preparePartitionedProject(root);
	assert(prepared, "net declarations should partition without explicit boundary decorators");
	assert.deepEqual(prepared.plugins[0].exports, {
		SharedMessage: "shared",
		SharedRequest: "shared",
		SharedResult: "shared",
		SharedScribeCommand: "shared",
		SharedScribeEvent: "shared",
	});
	const sharedSource = fs.readFileSync(
		path.join(prepared.stagingRoot, "plugins", "combat", "shared", "runtime.ts"),
		"utf8",
	);
	assert.match(sharedSource, /class SharedMessage/);
	assert.match(sharedSource, /class SharedRequest/);
	assert.match(sharedSource, /class SharedScribeEvent/);
	assert.match(sharedSource, /class SharedScribeCommand/);
	fs.rmSync(root, { recursive: true, force: true });
}

{
	const root = fixture(`
declare function client(target: object): void;
declare function server(target: object): void;
declare function shared(target: object): void;
declare function component(target: object): void;
declare function system(options: object): (target: object) => void;
declare class Update {}
declare type Query<T> = object;

@server
@component
export class ServerData {}

@client
@system({ schedule: Update })
export class ClientTick {
\trun(data: Query<[ServerData]>) {}
}

@server
@system({ schedule: Update })
export class ServerTick { run() {} }

@shared
export class SharedClock {}
`);
	assert.throws(
		() => preparePartitionedProject(root),
		/client system 'ClientTick' cannot query server component 'ServerData'/,
	);
	fs.rmSync(root, { recursive: true, force: true });
}

{
	const root = fixture(`
import { client, server, system } from "@rovy/core";
declare class Update {}

@client
@system({ schedule: Update })
export class ClientTick { run() {} }

@server
@system({ schedule: Update })
export class ServerTick { run() {} }

export class SharedClock {}
`);
	fs.writeFileSync(
		path.join(root, "src", "plugins", "combat", "index.ts"),
		[
			'import { plugin, shared } from "@rovy/core";',
			"@shared",
			"@plugin",
			"export class CombatPlugin { build() {} }",
			'export { ClientTick, ServerTick, SharedClock } from "./runtime";',
		].join("\n"),
	);
	writeCoreStub(root);
	const prepared = preparePartitionedProject(root);
	const configFile = ts.readConfigFile(prepared.projectFile, ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(prepared.projectFile));
	const program = ts.createProgram(parsed.fileNames, parsed.options);
	const generatedClient = program.getSourceFile(
		path.join(prepared.stagingRoot, "plugins", "combat", "client", "runtime.ts"),
	);
	assert(generatedClient, "generated client source should be in staged program");
	const previousStaging = process.env.ROVY_PARTITION_STAGING_ROOT;
	const previousSource = process.env.ROVY_PARTITION_SOURCE_ROOT;
	process.env.ROVY_PARTITION_STAGING_ROOT = prepared.stagingRoot;
	process.env.ROVY_PARTITION_SOURCE_ROOT = prepared.sourceRoot;
	const transformed = ts.transform(generatedClient, [
		transformerFactory(program, {}, { ts }),
	]);
	const printed = ts.createPrinter().printFile(transformed.transformed[0]);
	transformed.dispose();
	if (previousStaging === undefined) delete process.env.ROVY_PARTITION_STAGING_ROOT;
	else process.env.ROVY_PARTITION_STAGING_ROOT = previousStaging;
	if (previousSource === undefined) delete process.env.ROVY_PARTITION_SOURCE_ROOT;
	else process.env.ROVY_PARTITION_SOURCE_ROOT = previousSource;
	assert.equal(printed.includes('from "../shared/index"'), true, printed);
	assert.doesNotMatch(printed, /\.rovy-build/);
	fs.rmSync(root, { recursive: true, force: true });
}

{
	const root = fixture(`
declare function client(target: object): void;
declare function server(target: object): void;
declare function system(options: object): (target: object) => void;
declare class Update {}

@server
export class ServerOnly {
\tstatic run() {}
}

function indirect() {
\tServerOnly.run();
}

@client
@system({ schedule: Update })
export class ClientTick {
\trun() { indirect(); }
}

@server
@system({ schedule: Update })
export class ServerTick {
\trun() {}
}

export class SharedClock {}
`);
	assert.throws(
		() => preparePartitionedProject(root),
		/client declaration cannot reference server: ClientTick -> indirect -> ServerOnly/,
	);
	fs.rmSync(root, { recursive: true, force: true });
}

{
	const root = fixture(`
import { ServerApi } from "@acme/server-plugin";
declare function client(target: object): void;
declare function server(target: object): void;
declare function system(options: object): (target: object) => void;
declare class Update {}

@client
@system({ schedule: Update })
export class ClientTick {
\trun() { ServerApi.run(); }
}

@server
@system({ schedule: Update })
export class ServerTick {
\trun() {}
}

export class SharedClock {}
`);
	const packageDir = path.join(root, "node_modules", "@acme", "server-plugin");
	fs.mkdirSync(packageDir, { recursive: true });
	fs.writeFileSync(
		path.join(packageDir, "package.json"),
		JSON.stringify({ name: "@acme/server-plugin", types: "index.d.ts" }),
	);
	fs.writeFileSync(path.join(packageDir, "index.d.ts"), "export declare class ServerApi { static run(): void; }\n");
	fs.writeFileSync(
		path.join(packageDir, ".rovy-boundaries.json"),
		JSON.stringify({ version: 1, exports: { ServerApi: "server" } }),
	);
	assert.throws(
		() => preparePartitionedProject(root),
		/client declaration cannot reference packaged server export: ClientTick -> ServerApi/,
	);
	fs.rmSync(root, { recursive: true, force: true });
}

{
	const root = fixture(`
declare function client(target: object): void;
declare function server(target: object): void;
declare function system(options: object): (target: object) => void;
declare class Update {}
declare function boot(): void;

boot();

@client
@system({ schedule: Update })
export class ClientTick { run() {} }

@server
@system({ schedule: Update })
export class ServerTick { run() {} }

export class SharedClock {}
`);
	assert.throws(
		() => preparePartitionedProject(root),
		/ambiguous top-level executable statement/,
	);
	fs.rmSync(root, { recursive: true, force: true });
}

{
	const root = fixture(`
declare function client(target: object): void;
declare function server(target: object): void;
declare function system(options: object): (target: object) => void;
declare class Update {}

@client
@system({ schedule: Update })
export class ClientTick { run() {} }

@server
@system({ schedule: Update })
export class ServerTick { run() {} }

export class SharedClock {}
`);
	const oldFolder = path.join(root, "src", "plugins", "combat", "client");
	fs.mkdirSync(oldFolder, { recursive: true });
	fs.writeFileSync(path.join(oldFolder, "old.ts"), "export const old = true;\n");
	assert.throws(
		() => preparePartitionedProject(root),
		/uses removed authored boundary folder 'client'/,
	);
	fs.rmSync(root, { recursive: true, force: true });
}

console.log("partition tests OK");
