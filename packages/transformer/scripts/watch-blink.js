const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { generateBlink } = require("./generate-blink.js");

const projectDir = path.resolve(process.cwd(), process.argv[2] ?? ".");
const buildInfoPath = path.join(projectDir, "out", "tsconfig.tsbuildinfo");

let lastBuildInfoMtime = fileMtime(buildInfoPath);
let generating = false;
let rerunRequested = false;

function fileMtime(pathValue) {
	try {
		return fs.statSync(pathValue).mtimeMs;
	} catch {
		return 0;
	}
}

function runBlinkGeneration() {
	if (generating) {
		rerunRequested = true;
		return;
	}

	generating = true;
	try {
		generateBlink(projectDir);
		console.log(`[rovy-transformer] regenerated Blink artifacts for ${projectDir}`);
	} catch (error) {
		console.error(
			`[rovy-transformer] Blink regeneration failed: ${String(error instanceof Error ? error.message : error)}`,
		);
	} finally {
		generating = false;
		if (rerunRequested) {
			rerunRequested = false;
			runBlinkGeneration();
		}
	}
}

const rbxtsc = cp.spawn("rbxtsc", ["--type", "game", "-w"], {
	cwd: projectDir,
	stdio: ["inherit", "pipe", "pipe"],
});

rbxtsc.stdout.on("data", (chunk) => {
	process.stdout.write(chunk);
});

rbxtsc.stderr.on("data", (chunk) => {
	process.stderr.write(chunk);
});

const poll = setInterval(() => {
	const nextMtime = fileMtime(buildInfoPath);
	if (nextMtime === 0 || nextMtime === lastBuildInfoMtime) return;
	lastBuildInfoMtime = nextMtime;
	runBlinkGeneration();
}, 250);

function shutdown(signal) {
	clearInterval(poll);
	if (!rbxtsc.killed) {
		rbxtsc.kill(signal);
	}
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

rbxtsc.on("exit", (code, signal) => {
	clearInterval(poll);
	if (signal) {
		process.exit(0);
		return;
	}
	process.exit(code ?? 0);
});
