import { Res, ResMut, system } from "@rovy/core";
import { SnapshotCollect } from "../collectors";
import { ClientClock, HudState, SnapshotBufferState } from "../resources";
import { Render, SnapshotSet } from "../state";

@system({ schedule: Render, set: SnapshotSet })
export class ApplySnapshotIngress {
	run(
		ingress: SnapshotCollect,
		buffer: ResMut<SnapshotBufferState>,
		clock: Res<ClientClock>,
		hud: ResMut<HudState>,
	) {
		for (const snap of ingress.drain()) {
			buffer.previous = buffer.current;
			buffer.current = snap;
			buffer.currentReceivedAt = clock.now;
			hud.phase = snap.phase;
			hud.waveNumber = snap.waveNumber;
			hud.enemiesRemaining = snap.enemiesRemaining;
			hud.playerHealth = snap.playerHealth;
			hud.playerMaxHealth = snap.playerMaxHealth;
			hud.gameOver = snap.phase === "defeat";
		}
	}
}
