#!/usr/bin/env node
import cp from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(exampleDir, "../..");
const uiDir = path.join(repoRoot, "packages/ui");

const children = [];
let stopping = false;

function binPath(projectDir) {
	return `${path.join(projectDir, "node_modules/.bin")}${path.delimiter}${process.env.PATH ?? ""}`;
}

function spawn(name, command, args, options) {
	console.log(`[ui-test-place] ${name}: ${command} ${args.join(" ")}`);
	const child = cp.spawn(command, args, {
		stdio: "inherit",
		shell: process.platform === "win32",
		...options,
		env: {
			...process.env,
			PATH: binPath(options.cwd),
		},
	});

	children.push({ name, child });
	child.once("exit", (code, signal) => {
		if (stopping) return;
		const reason = signal ?? `code ${code ?? 0}`;
		console.log(`[ui-test-place] ${name} exited (${reason}); stopping serve session`);
		void stop(code === 0 || code === null ? 0 : code ?? 1);
	});
}

async function waitForExit(child) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	await new Promise((resolve) => child.once("exit", resolve));
}

async function stop(exitCode = 0) {
	if (stopping) return;
	stopping = true;

	for (const { child } of children) {
		if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
	}

	await Promise.all(children.map(({ child }) => waitForExit(child)));
	process.exit(exitCode);
}

process.once("SIGINT", () => void stop(0));
process.once("SIGTERM", () => void stop(0));

spawn("ui watch", "rbxtsc", ["-w"], { cwd: uiDir });
spawn("place serve", "node", ["../../packages/build/bin/rovy-build.js", "start"], { cwd: exampleDir });
