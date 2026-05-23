import { Res, ResMut, system } from "@rovy/core";
import { HudState, HudUiState } from "../resources";
import { Render, RenderSet } from "../state";
import EgooE from "@rbxts/egooe";

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

@system({ schedule: Render, set: RenderSet })
export class RenderHud {
	run(hud: Res<HudState>, hudUi: ResMut<HudUiState>) {
		const ratio = hud.playerMaxHealth > 0 ? hud.playerHealth / hud.playerMaxHealth : 0;
		const node = ensureHudNode(hudUi);

		if (hudUi.rendering) return;

		hudUi.rendering = true;
		try {
			EgooE.start(node, () => {
				EgooE.window(
					{
						title: "Zombie Game",
						size: new Vector2(240, 160),
						position: new Vector2(16, 16),
					},
					() => {
						EgooE.label(`Phase: ${hud.phase}`);
						EgooE.label(`Wave: ${hud.waveNumber}`);
						EgooE.label(`Enemies: ${hud.enemiesRemaining}`);
						EgooE.label(`Inspector pause: ${hud.paused ? "on" : "off"}`);
						EgooE.progressBar({
							value: ratio,
							label: `HP ${math.floor(hud.playerHealth)}/${hud.playerMaxHealth}`,
						});
						const pauseBtn = EgooE.button(hud.paused ? "Resume (P)" : "Pause (P)");
						if (pauseBtn.clicked()) {
							hudUi.local.setPaused(!hud.paused);
						}

						if (hud.gameOver) {
							EgooE.label("You died.");
							const restartBtn = EgooE.button("Restart (R)");
							if (restartBtn.clicked()) {
								hudUi.local.restart();
							}
						}
					},
				);
			});
		} finally {
			hudUi.rendering = false;
		}
	}
}
