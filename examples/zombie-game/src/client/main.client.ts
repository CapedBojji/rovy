/**
 * Client entry point. Boots the client Rovy app, wires it to RenderStepped
 * and the Roblox character/tool lifecycle, attaches the Flamework remote
 * bridge for snapshot reception + fire/restart sending, and kicks off the
 * egooe HUD loop.
 *
 * Top-level engine attachment is gated behind a pcall on
 * `game.GetService("RunService")` so the same module can be loaded
 * headlessly without booting against real services.
 */

import { App, rovy } from "@rovy/core";
import {
	FireWeaponRequestPayload,
	RestartRequestPayload,
	WorldSnapshotPayload,
	fireWeaponRequestSerializer,
	restartRequestSerializer,
	worldSnapshotSerializer,
} from "shared/contracts";
import { startEgooeHud } from "./hud";

function loadGameModule() {
	const ss = game.GetService("StarterPlayer").WaitForChild("StarterPlayerScripts").WaitForChild("TS");
	const module = ss.WaitForChild("game") as ModuleScript;
	return require(module) as typeof import("client/game");
}

function loadNetworkModule() {
	const rs = game.GetService("ReplicatedStorage").WaitForChild("TS");
	const module = rs.WaitForChild("network") as ModuleScript;
	return require(module) as typeof import("shared/network");
}

const TOOL_NAME = "Block Blaster";

function bootRuntime() {
	rovy.__reset();
	rovy.loadPaths("src/shared", "src/client");
	const clientGame = loadGameModule();
	const app = clientGame.boot();
	return { app, game: clientGame };
}

function attachEngineHooks(runtime: { app: App; game: typeof import("client/game") }): void {
	const { app, game: gameMod } = runtime;
	const Players = game.GetService("Players");
	const RunService = game.GetService("RunService");
	const Workspace = game.GetService("Workspace");
	const UserInputService = game.GetService("UserInputService");
	const network = loadNetworkModule();

	const localPlayer = Players.LocalPlayer;
	if (localPlayer === undefined) {
		warn("[zombie-game] LocalPlayer not available; aborting client boot");
		return;
	}
	gameMod.setLocalPlayer(app, localPlayer.UserId);

	// ── Networking bridge ────────────────────────────────────────────────
	const client = network.GlobalEvents.createClient({});
	client.worldSnapshot.connect((bytes: buffer) => {
		const snapshot = worldSnapshotSerializer.deserialize(bytes, []) as WorldSnapshotPayload;
		gameMod.deliverSnapshot(app, snapshot);
	});
	gameMod.installFireBridge(app, (request: FireWeaponRequestPayload) => {
		const bytes = fireWeaponRequestSerializer.serialize(request);
		client.fireWeapon.fire(bytes.buffer);
	});
	gameMod.installRestartBridge(app, () => {
		const bytes = restartRequestSerializer.serialize(new RestartRequestPayload(tick()));
		client.requestRestart.fire(bytes.buffer);
	});

	// ── LocalPlayer character / tool lifecycle ───────────────────────────
	let currentTool: Tool | undefined;
	const onCharacter = (character: Model) => {
		gameMod.setLocalCharacter(app, character);
		currentTool = undefined;

		const refreshTool = () => {
			const equipped = character.FindFirstChildOfClass("Tool");
			if (equipped && equipped.Name === TOOL_NAME) {
				if (currentTool !== equipped) {
					currentTool = equipped;
					equipped.Activated.Connect(() => onToolActivated(character, equipped));
				}
			} else if (currentTool && currentTool.Parent !== character) {
				currentTool = undefined;
			}
		};

		character.ChildAdded.Connect(refreshTool);
		character.ChildRemoved.Connect(refreshTool);
		refreshTool();
	};
	if (localPlayer.Character) onCharacter(localPlayer.Character);
	localPlayer.CharacterAdded.Connect(onCharacter);

	const onToolActivated = (character: Model, _tool: Tool) => {
		const root = character.FindFirstChild("HumanoidRootPart");
		if (!root || !root.IsA("BasePart")) return;
		const cam = Workspace.CurrentCamera;
		const lookVector = cam !== undefined ? cam.CFrame.LookVector : root.CFrame.LookVector;
		const origin = root.Position.add(lookVector.mul(2));
		gameMod.emitLocalFire(app, origin, lookVector);
	};

	// Some keybinds: R to restart while defeated.
	UserInputService.InputBegan.Connect((input, processed) => {
		if (processed) return;
		if (input.KeyCode === Enum.KeyCode.R && gameMod.readHudState(app).gameOver) {
			gameMod.emitLocalRestart(app);
		}
	});

	// ── RenderStepped drives the client schedule ─────────────────────────
	RunService.RenderStepped.Connect((dt) => {
		gameMod.setClockDelta(app, dt);
		app.runSchedule(gameMod.Render);
	});

	// ── HUD loop ─────────────────────────────────────────────────────────
	startEgooeHud(app, gameMod);
}

const [hasRunService] = pcall(() => game.GetService("RunService"));
if (hasRunService) {
	const runtime = bootRuntime();
	attachEngineHooks(runtime);
	print("[zombie-game] client runtime online");
}

export {};
