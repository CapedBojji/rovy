import EgooE from "@rbxts/egooe";
import { schedule, SystemSet } from "@rovy/core";
import { PATH_START_X, PATH_END_X, TURRET_POSITION } from "shared/contracts";
import { HudUiState, RenderRegistry } from "./resources";

@schedule
export class Render {}

export class FrameSet extends SystemSet {}
export class NetworkSet extends SystemSet {}
export class ModelSet extends SystemSet {}
export class RenderSet extends SystemSet {}

export const MONSTER_SIZE = new Vector3(4, 4, 4);
export const MONSTER_COLOR = Color3.fromRGB(95, 190, 95);
export const MONSTER_HIT_COLOR = Color3.fromRGB(95, 190, 95);
export const MONSTER_MISS_COLOR = Color3.fromRGB(225, 110, 82);
export const MONSTER_MATERIAL = Enum.Material.SmoothPlastic;
export const MONSTER_Y_OFFSET = MONSTER_SIZE.Y / 2;

export const PROJECTILE_SIZE = new Vector3(1.2, 1.2, 1.2);
export const PROJECTILE_COLOR = Color3.fromRGB(255, 218, 66);
export const PROJECTILE_MATERIAL = Enum.Material.Neon;
export const PROJECTILE_Y_OFFSET = 0;

export const TURRET_SIZE = new Vector3(6, 8, 6);
export const TURRET_COLOR = Color3.fromRGB(80, 145, 255);
export const TURRET_MATERIAL = Enum.Material.Metal;
export const TURRET_Y_OFFSET = 0;
export const TURRET_RENDER_POSITION = TURRET_POSITION;

export function ensureRootFolder(reg: RenderRegistry): Folder {
	if (reg.rootFolder !== undefined && reg.rootFolder.Parent !== undefined) return reg.rootFolder;
	const folder = new Instance("Folder");
	folder.Name = "TowerDefenseClientRender";
	folder.Parent = game.Workspace;
	reg.rootFolder = folder;

	const path = new Instance("Part");
	path.Name = "TowerDefensePath";
	path.Anchored = true;
	path.CanCollide = false;
	path.Size = new Vector3(PATH_END_X - PATH_START_X, 0.4, 8);
	path.Position = new Vector3((PATH_START_X + PATH_END_X) / 2, 0.2, 0);
	path.Color = Color3.fromRGB(70, 70, 76);
	path.Material = Enum.Material.Asphalt;
	path.Parent = folder;
	return folder;
}

export function ensureHudNode(hudUi: HudUiState): ReturnType<typeof EgooE.new> {
	if (hudUi.node !== undefined && hudUi.gui?.Parent !== undefined) return hudUi.node;

	const Players = game.GetService("Players");
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "TowerDefenseHud";
	gui.ResetOnSpawn = false;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	gui.Parent = playerGui;

	hudUi.gui = gui;
	hudUi.node = EgooE.new(gui);
	return hudUi.node;
}
