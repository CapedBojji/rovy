/**
 * Server entry point. Boots the Rovy app, keeps the fixed-step heartbeat,
 * gives players the tool, and forwards finished snapshot bytes to clients.
 *
 * Player lifecycle and remote ingress now live inside collectors, so this
 * file stays thin and engine-facing.
 */

import { App, rovy } from "@rovy/core";
import { SERVER_FIXED_DELTA, ZombieGameSmokeResult } from "shared/contracts";

function loadGameModule() {
	const ss = game.GetService("ServerScriptService").WaitForChild("TS");
	const module = ss.WaitForChild("game") as ModuleScript;
	return require(module) as typeof import("server/game");
}

const TOOL_NAME = "Block Blaster";

function ensureToolTemplate(): Tool {
	const serverStorage = game.GetService("ServerStorage");
	const existing = serverStorage.FindFirstChild(TOOL_NAME);
	if (existing && existing.IsA("Tool")) return existing;

	const tool = new Instance("Tool");
	tool.Name = TOOL_NAME;
	tool.RequiresHandle = true;
	tool.CanBeDropped = false;

	const handle = new Instance("Part");
	handle.Name = "Handle";
	handle.Size = new Vector3(0.8, 0.6, 1.6);
	handle.Color = Color3.fromRGB(20, 20, 20);
	handle.Material = Enum.Material.Metal;
	handle.TopSurface = Enum.SurfaceType.Smooth;
	handle.BottomSurface = Enum.SurfaceType.Smooth;
	handle.Parent = tool;

	tool.Parent = serverStorage;
	return tool;
}

function giveToolTo(player: Player): void {
	const template = ensureToolTemplate();
	const backpack = player.FindFirstChildOfClass("Backpack");
	if (backpack && !backpack.FindFirstChild(TOOL_NAME)) {
		template.Clone().Parent = backpack;
	}
	const starter = player.FindFirstChild("StarterGear");
	if (starter && !starter.FindFirstChild(TOOL_NAME)) {
		template.Clone().Parent = starter;
	}
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
	const Players = game.GetService("Players");
	const RunService = game.GetService("RunService");

	for (const player of Players.GetPlayers()) giveToolTo(player);
	Players.PlayerAdded.Connect((player) => giveToolTo(player));

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
	print("[zombie-game] server runtime online");
}

export function runZombieGameSmoke(): ZombieGameSmokeResult {
	return loadGameModule().runZombieGameSmoke();
}
