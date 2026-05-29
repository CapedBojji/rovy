import { Res, ResMut, system } from "@rovy/core";
import RovyUi, { demoWindow } from "@rovy/ui";
import { HudState, HudUiState } from "../resources";
import { ensureHudNode, Render, RenderSet } from "../state";

@system({ schedule: Render, set: RenderSet })
export class RenderHud {
	run(hud: Res<HudState>, hudUi: ResMut<HudUiState>) {
		const node = ensureHudNode(hudUi);
		if (hudUi.rendering) return;

		hudUi.rendering = true;
		try {
			RovyUi.start(node, () => {
				demoWindow();
				RovyUi.window(
					{
						title: "Tower Defense",
						size: new Vector2(290, 220),
						position: new Vector2(450, 16),
					},
					() => {
						RovyUi.label(`Tick: ${hud.serverTick}  Time: ${math.floor(hud.simTime)}`);
						RovyUi.label(`Active: ${hud.activeMonsters} monsters  ${hud.activeProjectiles} shots`);
						RovyUi.label(`Spawned: ${hud.monstersSpawned}  Killed: ${hud.monstersKilled}`);
						RovyUi.label(`Escaped: ${hud.monstersEscaped}  Damage events: ${hud.damageEvents}`);
						RovyUi.label(`Total leak damage: ${hud.totalLeakDamage}`);
						RovyUi.label(`Turret shots: ${hud.shotsFired}`);
						RovyUi.label(`Server saw client frame: ${hud.lastClientFrameSeenByServer}`);
					},
				);
			});
		} finally {
			hudUi.rendering = false;
		}
	}
}
