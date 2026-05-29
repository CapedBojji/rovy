import { Res, ResMut, system } from "@rovy/core";
import RovyUi, { demoWindow } from "@rovy/ui";
import { HudState, HudUiState } from "../resources";
import { ensureHudNode, Render, RenderSet } from "../state";

@system({ schedule: Render, set: RenderSet })
export class RenderHud {
	run(hud: Res<HudState>, hudUi: ResMut<HudUiState>) {
		const ratio = hud.playerMaxHealth > 0 ? hud.playerHealth / hud.playerMaxHealth : 0;
		const node = ensureHudNode(hudUi);

		if (hudUi.rendering) return;

		hudUi.rendering = true;
		try {
			RovyUi.start(node, () => {
				demoWindow();
				RovyUi.window(
					{
						title: "Zombie Game",
						size: new Vector2(260, 220),
						position: new Vector2(16, 16),
					},
					() => {
						RovyUi.label(`Phase: ${hud.phase}`);
						RovyUi.label(`Wave: ${hud.waveNumber}`);
						RovyUi.label(`Enemies: ${hud.enemiesRemaining}`);
						RovyUi.label(`Score: ${hud.score}`);
						RovyUi.label(`Kills: ${hud.kills}  Shots: ${hud.shotsFired}`);
						RovyUi.label(`Combo: x${hud.combo}  Best: x${hud.bestCombo}`);
						RovyUi.label(`Inspector pause: ${hud.paused ? "on" : "off"}`);
						RovyUi.progressBar({
							value: ratio,
							label: `HP ${math.floor(hud.playerHealth)}/${hud.playerMaxHealth}`,
						});
						const pauseBtn = RovyUi.button(hud.paused ? "Resume (P)" : "Pause (P)");
						if (pauseBtn.clicked()) {
							hudUi.local.setPaused(!hud.paused);
						}

						if (hud.gameOver) {
							RovyUi.label("You died.");
							const restartBtn = RovyUi.button("Restart (R)");
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
