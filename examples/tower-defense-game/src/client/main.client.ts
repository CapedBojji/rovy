import { App, rovy } from "@rovy/core";

function loadGameModule() {
	const ss = game.GetService("StarterPlayer").WaitForChild("StarterPlayerScripts").WaitForChild("TS");
	const module = ss.WaitForChild("game") as ModuleScript;
	return require(module) as typeof import("client/game");
}

function bootRuntime() {
	rovy.__reset();
	rovy.loadPaths("src/shared", "src/client");
	const clientGame = loadGameModule();
	const app = clientGame.boot();
	return { app, game: clientGame };
}

function attachEngineHooks(runtime: {
	app: App;
	game: typeof import("client/game");
}): void {
	const { app, game: gameMod } = runtime;
	const RunService = game.GetService("RunService");
	const UserInputService = game.GetService("UserInputService");
	RunService.RenderStepped.Connect((dt) => {
		gameMod.setClockDelta(app, dt);
		app.runSchedule(gameMod.Render);
	});
	UserInputService.InputBegan.Connect((input, processed) => {
		if (processed) return;
		if (input.KeyCode === Enum.KeyCode.F2) {
			gameMod.toggleInspector(app);
		}
	});
}

const [hasRunService] = pcall(() => game.GetService("RunService"));
if (hasRunService) {
	const runtime = bootRuntime();
	attachEngineHooks(runtime);
	print("[tower-defense] client runtime online");
}
