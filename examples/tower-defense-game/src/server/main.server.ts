import { App, rovy } from "@rovy/core";
import { SERVER_FIXED_DELTA, TowerDefenseSmokeResult } from "shared/contracts";

function loadGameModule() {
	const ss = game.GetService("ServerScriptService").WaitForChild("TS");
	const module = ss.WaitForChild("game") as ModuleScript;
	return require(module) as typeof import("server/game");
}

interface ServerRuntime {
	app: App;
	game: typeof import("server/game");
}

function bootRuntime(): ServerRuntime {
	rovy.__reset();
	rovy.loadPaths("src/shared", "src/server");
	const gameModule = loadGameModule();
	const app = gameModule.boot();
	return { app, game: gameModule };
}

function attachEngineHooks({ app, game: gameMod }: ServerRuntime): void {
	const RunService = game.GetService("RunService");
	let accumulator = 0;
	RunService.Heartbeat.Connect((dt) => {
		accumulator += dt;
		if (accumulator > 0.25) accumulator = 0.25;
		while (accumulator >= SERVER_FIXED_DELTA) {
			accumulator -= SERVER_FIXED_DELTA;
			gameMod.stepFixed(app);
		}
	});
}

const [hasRunService] = pcall(() => game.GetService("RunService"));
if (hasRunService) {
	const runtime = bootRuntime();
	attachEngineHooks(runtime);
	print("[tower-defense] server runtime online");
}

export function runTowerDefenseSmoke(): TowerDefenseSmokeResult {
	return loadGameModule().runTowerDefenseSmoke();
}
