import EgooE from "@rbxts/egooe";
import { SystemSet, schedule } from "@rovy/core";
import { SNAPSHOT_INTERVAL } from "shared/contracts";
import { HudUiState, RenderRegistry } from "./resources";

@schedule
export class Render {}

export class FrameSet extends SystemSet {}
export class SnapshotSet extends SystemSet {}
export class InputSet extends SystemSet {}
export class RenderSet extends SystemSet {}

const ZOMBIE_SIZE = new Vector3(4, 6, 4);
const PROJECTILE_SIZE = new Vector3(1, 1, 1.5);
const ZOMBIE_COLOR = Color3.fromRGB(60, 160, 60);
const PROJECTILE_COLOR = Color3.fromRGB(245, 215, 55);

export function ensureRootFolder(reg: RenderRegistry): Folder {
	if (reg.rootFolder !== undefined && reg.rootFolder.Parent !== undefined) return reg.rootFolder;
	const folder = new Instance("Folder");
	folder.Name = "ZombieGameClientRender";
	folder.Parent = game.Workspace;
	reg.rootFolder = folder;
	return folder;
}

export function createZombiePart(reg: RenderRegistry, id: number, position: Vector3): Part {
	const part = new Instance("Part");
	part.Name = `Zombie_${id}`;
	part.Anchored = true;
	part.CanCollide = false;
	part.CanQuery = false;
	part.CanTouch = false;
	part.Material = Enum.Material.SmoothPlastic;
	part.Color = ZOMBIE_COLOR;
	part.Size = ZOMBIE_SIZE;
	part.CFrame = new CFrame(position.add(new Vector3(0, ZOMBIE_SIZE.Y / 2, 0)));
	part.Parent = ensureRootFolder(reg);
	return part;
}

export function createProjectilePart(reg: RenderRegistry, id: number, position: Vector3): Part {
	const part = new Instance("Part");
	part.Name = `Projectile_${id}`;
	part.Anchored = true;
	part.CanCollide = false;
	part.CanQuery = false;
	part.CanTouch = false;
	part.Material = Enum.Material.Neon;
	part.Color = PROJECTILE_COLOR;
	part.Size = PROJECTILE_SIZE;
	part.CFrame = new CFrame(position);
	part.Parent = ensureRootFolder(reg);
	return part;
}

export function lerpVector(a: Vector3, b: Vector3, alpha: number): Vector3 {
	return a.add(b.sub(a).mul(alpha));
}

export function ensureHudNode(hudUi: HudUiState): ReturnType<typeof EgooE.new> {
	if (hudUi.node !== undefined && hudUi.gui?.Parent !== undefined) return hudUi.node;

	const Players = game.GetService("Players");
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "ZombieGameHud";
	gui.ResetOnSpawn = false;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	gui.Parent = playerGui;

	hudUi.gui = gui;
	hudUi.node = EgooE.new(gui);
	return hudUi.node;
}

export { SNAPSHOT_INTERVAL };
