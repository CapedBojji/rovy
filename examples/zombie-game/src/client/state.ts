import RovyUi from "@rovy/ui";
import { SystemSet, schedule } from "@rovy/core";
import { SNAPSHOT_INTERVAL } from "shared/contracts";
import { HudUiState, RenderRegistry } from "./resources";

@schedule
export class Render {}

export class FrameSet extends SystemSet {}
export class SnapshotSet extends SystemSet {}
export class InputSet extends SystemSet {}
export class RenderSet extends SystemSet {}

export const ZOMBIE_SIZE = new Vector3(4, 6, 4);
export const ZOMBIE_COLOR = Color3.fromRGB(60, 160, 60);
export const ZOMBIE_MATERIAL = Enum.Material.SmoothPlastic;
export const ZOMBIE_Y_OFFSET = ZOMBIE_SIZE.Y / 2;

export const PROJECTILE_SIZE = new Vector3(1, 1, 1.5);
export const PROJECTILE_COLOR = Color3.fromRGB(245, 215, 55);
export const PROJECTILE_MATERIAL = Enum.Material.Neon;
export const PROJECTILE_Y_OFFSET = 0;

export function ensureRootFolder(reg: RenderRegistry): Folder {
	if (reg.rootFolder !== undefined && reg.rootFolder.Parent !== undefined) return reg.rootFolder;
	const folder = new Instance("Folder");
	folder.Name = "ZombieGameClientRender";
	folder.Parent = game.Workspace;
	reg.rootFolder = folder;
	return folder;
}

export function ensureHudNode(hudUi: HudUiState): ReturnType<typeof RovyUi.new> {
	if (hudUi.node !== undefined && hudUi.gui?.Parent !== undefined) return hudUi.node;

	const Players = game.GetService("Players");
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "ZombieGameHud";
	gui.ResetOnSpawn = false;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	gui.Parent = playerGui;

	hudUi.gui = gui;
	hudUi.node = RovyUi.new(gui);
	return hudUi.node;
}

export { SNAPSHOT_INTERVAL };
