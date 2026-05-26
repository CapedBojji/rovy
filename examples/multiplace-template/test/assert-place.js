import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "../..");
const places = ["build/rovy-multiplace-lobby.rbxl", "build/rovy-multiplace-arena.rbxl"];

for (const place of places) {
	if (!fs.existsSync(path.join(root, place))) {
		throw new Error(`missing place file: ${place}`);
	}
}

console.log("multiplace place files OK");
