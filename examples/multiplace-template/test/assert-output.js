import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputs = [
	"out/lobby/lobby/src/server/main.server.luau",
	"out/lobby/lobby/src/client/main.client.luau",
	"out/lobby/shared/src/place-game.luau",
	"out/arena/arena/src/server/main.server.luau",
	"out/arena/arena/src/client/main.client.luau",
	"out/arena/shared/src/place-game.luau",
];

for (const output of outputs) {
	if (!fs.existsSync(path.join(root, output))) {
		throw new Error(`missing compiled output: ${output}`);
	}
}

const checks = [
	["out/lobby/lobby/src/client/main.client.luau", "RovyMultiplaceInspector"],
	["out/arena/arena/src/client/main.client.luau", "RovyMultiplaceInspector"],
	["out/lobby/shared/src/place-game.luau", "__netEvent"],
	["out/arena/shared/src/place-game.luau", "__netEvent"],
	["out/lobby/shared/src/place-game.luau", "PlaceSnapshotNet"],
	["out/arena/shared/src/place-game.luau", "PlacePingNet"],
];

for (const [file, text] of checks) {
	const contents = fs.readFileSync(path.join(root, file), "utf8");
	if (!contents.includes(text)) {
		throw new Error(`${file} missing ${text}`);
	}
}

console.log("multiplace output OK");
