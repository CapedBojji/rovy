import EgooE from "@rbxts/egooe";
import { Res, ResMut, system } from "@rovy/core";
import { HudState, HudUiState } from "../resources";
import { ensureHudNode, Render, RenderSet } from "../state";

@system({ schedule: Render, set: RenderSet })
export class RenderHud {
	run(hud: Res<HudState>, hudUi: ResMut<HudUiState>) {
		const node = ensureHudNode(hudUi);
		if (hudUi.rendering) return;

		hudUi.rendering = true;
		try {
			EgooE.start(node, () => {
				EgooE.window(
					{
						title: "Tower Defense",
						size: new Vector2(290, 220),
						position: new Vector2(16, 16),
					},
					() => {
						EgooE.label(`Tick: ${hud.serverTick}  Time: ${math.floor(hud.simTime)}`);
						EgooE.label(`Active: ${hud.activeMonsters} monsters  ${hud.activeProjectiles} shots`);
						EgooE.label(`Spawned: ${hud.monstersSpawned}  Killed: ${hud.monstersKilled}`);
						EgooE.label(`Escaped: ${hud.monstersEscaped}  Damage events: ${hud.damageEvents}`);
						EgooE.label(`Total leak damage: ${hud.totalLeakDamage}`);
						EgooE.label(`Turret shots: ${hud.shotsFired}`);
						EgooE.label(`Server saw client frame: ${hud.lastClientFrameSeenByServer}`);
					},
				);
			});
		} finally {
			hudUi.rendering = false;
		}
	}
}
