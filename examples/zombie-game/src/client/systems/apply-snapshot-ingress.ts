import { EventReader, Res, ResMut, system } from "@rovy/core";
import { WorldSnapshotPayload } from "shared/contracts";
import { WorldSnapshotNet, fromWorldSnapshotNet } from "shared/network";
import { ClientClock, HudState, SnapshotBufferState } from "../resources";
import { Render, SnapshotSet } from "../state";

@system({ schedule: Render, set: SnapshotSet })
export class ApplySnapshotIngress {
	run(
		ingress: EventReader<WorldSnapshotNet>,
		buffer: ResMut<SnapshotBufferState>,
		clock: Res<ClientClock>,
		hud: ResMut<HudState>,
	) {
		ingress.forEach((event) => {
			const snap = fromWorldSnapshotNet(event) as WorldSnapshotPayload;
			buffer.previous = buffer.current;
			buffer.current = snap;
			buffer.currentReceivedAt = clock.now;
			hud.phase = snap.phase;
			hud.waveNumber = snap.waveNumber;
			hud.enemiesRemaining = snap.enemiesRemaining;
			hud.playerHealth = snap.playerHealth;
			hud.playerMaxHealth = snap.playerMaxHealth;
			hud.gameOver = snap.phase === "defeat";
		});
	}
}
