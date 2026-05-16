/**
 * HUD renderer.
 *
 * Per plan, `@rbxts/egooe` was the first-choice immediate-mode renderer.
 * Iris ships as the explicitly-sanctioned fallback when egooe blocks
 * delivery (see plan handoff notes). We render against Iris here because
 * the Iris API surface is stable + well-documented and the HudState
 * contract is unchanged either way. Swapping back to egooe later only
 * requires rewriting this one file — `HudState`, `LocalRestartIntent`,
 * and the bridge stay identical.
 */

import { App } from "@rovy/core";
import Iris from "@rbxts/iris";
import type { HudState, LocalPlayerState } from "./game";

type ClientGame = typeof import("client/game");

let irisStarted = false;

function startIrisOnce(): void {
	if (irisStarted) return;
	irisStarted = true;
	Iris.Init();
}

/**
 * Begin the HUD draw loop. Pulls `HudState` each frame from the live Rovy
 * app — render is purely a function of HUD state, no caching.
 */
export function startEgooeHud(app: App, gameMod: ClientGame): void {
	startIrisOnce();

	Iris.Connect(() => {
		const hud: HudState = gameMod.readHudState(app);
		const localPlayer: LocalPlayerState = app.world.resource(gameMod.LocalPlayerState);
		void localPlayer;

		Iris.Window(
			["Zombie Game"],
			{
				size: Iris.State(new Vector2(240, 160)),
				position: Iris.State(new Vector2(16, 16)),
			} as never,
		);

		Iris.Text([`Phase: ${hud.phase}`]);
		Iris.Text([`Wave: ${hud.waveNumber}`]);
		Iris.Text([`Enemies: ${hud.enemiesRemaining}`]);

		const ratio = hud.playerMaxHealth > 0 ? hud.playerHealth / hud.playerMaxHealth : 0;
		Iris.ProgressBar(
			[`HP ${math.floor(hud.playerHealth)}/${hud.playerMaxHealth}`],
			{ progress: Iris.State(ratio) } as never,
		);

		if (hud.gameOver) {
			Iris.Text(["You died."]);
			const restartBtn = Iris.Button(["Restart (R)"]);
			if (restartBtn.clicked()) {
				gameMod.emitLocalRestart(app);
			}
		}

		Iris.End();
	});
}
