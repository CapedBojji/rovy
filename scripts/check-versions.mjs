#!/usr/bin/env node
// Publish guard: every workspace package agrees on one version, no workspace:*
// protocol leaks into a published range, and @rovy/core's exported VERSION
// constant matches its manifest.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const packagesDir = join(root, "packages");

// @rovy/jecs is a vendored re-publish and tracks the upstream jecs version.
const INDEPENDENT = new Set(["@rovy/jecs"]);

const errors = [];
const manifests = [];

for (const dir of readdirSync(packagesDir)) {
	const path = join(packagesDir, dir, "package.json");
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		continue;
	}
	manifests.push({ dir, path, manifest });
}

const versioned = manifests.filter(({ manifest }) => !INDEPENDENT.has(manifest.name));
const versions = new Set(versioned.map(({ manifest }) => manifest.version));

if (versions.size !== 1) {
	const listed = versioned
		.map(({ manifest }) => `  ${manifest.name}@${manifest.version}`)
		.join("\n");
	errors.push(`packages disagree on version:\n${listed}`);
}

const [version] = [...versions];

for (const { manifest, path } of manifests) {
	for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
		for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
			if (typeof range === "string" && range.startsWith("workspace:")) {
				errors.push(`${path}: ${field}.${dep} is "${range}"; publishing needs a real range`);
			}
		}
	}
	if (!manifest.private && manifest.license === undefined) {
		errors.push(`${path}: missing "license"`);
	}
}

const coreIndex = join(packagesDir, "core", "src", "index.ts");
const declared = /export const VERSION = "([^"]+)"/.exec(readFileSync(coreIndex, "utf8"))?.[1];
if (declared !== version) {
	errors.push(`${coreIndex}: VERSION is "${declared}" but @rovy/core is "${version}"`);
}

if (errors.length > 0) {
	for (const error of errors) console.error(`error: ${error}`);
	process.exit(1);
}

console.log(`version check passed (${version})`);
