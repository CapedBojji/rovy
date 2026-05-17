const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const transformerModule = require("../dist/index.js");
const factory = transformerModule.default ?? transformerModule;

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

	const host = ts.createCompilerHost(parsed.options);
	host.getCurrentDirectory = () => projectDir;
	const program = ts.createProgram(parsed.fileNames, parsed.options, host);
	const sourceFile = program.getSourceFiles().find((file) => !file.isDeclarationFile && file.fileName.startsWith(projectDir));
	if (!sourceFile) {
		throw new Error(`no source files found for ${projectDir}`);
	}

	const transformer = factory(program, { config: ".rovy.json" }, { ts });
	const result = ts.transform(sourceFile, [transformer]);

	try {
		if (result.diagnostics.length > 0) {
			throw new Error(
				result.diagnostics.map((diag) => ts.flattenDiagnosticMessageText(diag.messageText, "\n")).join("\n"),
			);
		}

		const generatedDir = path.join(projectDir, "out", "shared", "net", "generated");
		const expected = [
			"rovy.generated.blink",
			"RovyBlinkClient.luau",
			"RovyBlinkServer.luau",
			"RovyBlinkTypes.luau",
		];
		const missing = expected.filter((name) => !fs.existsSync(path.join(generatedDir, name)));
		if (missing.length > 0) {
			throw new Error(`blink generation did not produce expected files in ${generatedDir}: ${missing.join(", ")}`);
		}
	} finally {
		result.dispose();
	}
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
