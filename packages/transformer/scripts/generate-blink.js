const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const ts = require("typescript");

const transformerModule = require("../dist/index.js");
const factory = transformerModule.default ?? transformerModule;
const { loadRovyConfig } = require("../dist/rovy-config.js");

function generateBlink(projectDir) {
	const tsconfigPath = path.join(projectDir, "tsconfig.json");

	if (!fs.existsSync(tsconfigPath)) {
		throw new Error(`missing tsconfig.json at ${tsconfigPath}`);
	}

	const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
	if (configFile.error) {
		throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
	}

	const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectDir);
	if (parsed.errors.length > 0) {
		throw new Error(parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n"));
	}

	const rootDir = path.resolve(projectDir, parsed.options.rootDir ?? projectDir);
	const outDir = path.resolve(projectDir, parsed.options.outDir ?? rootDir);
	const config = fs.existsSync(path.join(projectDir, ".rovy.json")) ? { config: ".rovy.json" } : {};
	const rovyConfig = loadRovyConfig(projectDir, config, {
		absolute: (value) => path.resolve(projectDir, value),
		exists: (pathValue) => fs.existsSync(pathValue),
	});

	if (rovyConfig?.environment.net?.transport === "remote" || rovyConfig?.environment.net?.blink?.enabled === false) {
		return;
	}

	const host = ts.createCompilerHost(parsed.options);
	host.getCurrentDirectory = () => projectDir;
	const program = ts.createProgram(parsed.fileNames, parsed.options, host);

	const transformer = factory(program, config, { ts });
	const printer = ts.createPrinter({ removeComments: true });
	const schemas = [];
	const diagnostics = [];
	for (const fileName of parsed.fileNames) {
		const sourceFile = program.getSourceFile(fileName);
		if (!sourceFile || sourceFile.isDeclarationFile) continue;
		const result = ts.transform(sourceFile, [transformer]);
		if (result.diagnostics.length > 0) {
			diagnostics.push(
				...result.diagnostics.map((diag) => ts.flattenDiagnosticMessageText(diag.messageText, "\n")),
			);
		}
		const printed = printer.printFile(result.transformed[0]);
		for (const match of printed.matchAll(/(?:blink|requestBlink|resultBlink): ("(?:[^"\\]|\\.)*")/g)) {
			schemas.push(JSON.parse(match[1]));
		}
		result.dispose();
	}
	if (diagnostics.length > 0) {
		throw new Error(diagnostics.join("\n"));
	}
	if (schemas.length === 0) return;

	const blink = rovyConfig?.environment.net?.blink ?? {};
	const generatedDir = path.join(outDir, "shared", "net", "generated");
	const sourcePath = path.join(generatedDir, "rovy.generated.blink");
	const clientPath = path.join(generatedDir, "RovyBlinkClient.luau");
	const serverPath = path.join(generatedDir, "RovyBlinkServer.luau");
	const typesPath = path.join(generatedDir, "RovyBlinkTypes.luau");

	fs.mkdirSync(generatedDir, { recursive: true });
	fs.writeFileSync(
		sourcePath,
		[
			"option Casing = Pascal",
			"option Typescript = true",
			`option RemoteScope = "${blink.remoteScope ?? "ROVY"}"`,
			`option ManualReplication = ${(blink.manualReplication ?? true) ? "true" : "false"}`,
			`option UsePolling = ${(blink.usePolling ?? true) ? "true" : "false"}`,
			`option ClientOutput = "${clientPath}"`,
			`option ServerOutput = "${serverPath}"`,
			`option TypesOutput = "${typesPath}"`,
			"",
			...schemas,
			"",
		].join("\n"),
	);

	const result = runBlink(sourcePath);
	const expected = [sourcePath, clientPath, serverPath, typesPath];
	const missing = expected.filter((name) => !fs.existsSync(name));
	const empty = expected.filter((name) => fs.existsSync(name) && fs.statSync(name).size === 0);
	if (result.status !== 0 || result.error || result.signal || missing.length > 0 || empty.length > 0) {
		throw new Error(blinkFailureMessage(result, missing, empty));
	}
}

function runBlink(sourcePath) {
	let result = cp.spawnSync("blink", [sourcePath, "--yes", "--quiet"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error && result.error.code === "ENOENT") {
		result = cp.spawnSync("mise", ["exec", "--", "blink", sourcePath, "--yes", "--quiet"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	}
	return result;
}

function blinkFailureMessage(result, missing, empty) {
	const details = [];
	if (result.error) details.push(`error: ${result.error.message}`);
	if (result.signal) details.push(`signal: ${result.signal}`);
	if (result.status !== 0) details.push(`status: ${result.status ?? "unknown"}`);
	if (missing.length > 0) details.push(`missing output: ${missing.join(", ")}`);
	if (empty.length > 0) details.push(`empty output: ${empty.join(", ")}`);
	return [
		"Blink generation failed.",
		...details,
		`stdout:\n${result.stdout ?? ""}`,
		`stderr:\n${result.stderr ?? ""}`,
	].join("\n");
}

function main() {
	const projectDirArg = process.argv[2] ?? ".";
	const projectDir = path.resolve(process.cwd(), projectDirArg);
	generateBlink(projectDir);
}

try {
	if (require.main === module) {
		main();
	}
} catch (error) {
	if (require.main === module) {
		console.error(String(error instanceof Error ? error.message : error));
		process.exit(1);
	} else {
		throw error;
	}
}

module.exports = {
	generateBlink,
};
