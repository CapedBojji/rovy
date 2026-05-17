import {
	FireWeaponRequestPayload,
	RestartRequestPayload,
	fireWeaponRequestSerializer,
	restartRequestSerializer,
} from "shared/contracts";
import { Res, ResMut, system } from "@rovy/core";
import { LocalClientCollect } from "../collectors";
import { ClientNetworkState } from "../network";
import { HudState, LocalPlayerState } from "../resources";
import { InputSet, Render } from "../state";

@system({ schedule: Render, set: InputSet })
export class ApplyLocalIngress {
	run(
		ingress: LocalClientCollect,
		network: Res<ClientNetworkState>,
		hud: Res<HudState>,
		localPlayer: ResMut<LocalPlayerState>,
	) {
		for (const event of ingress.drain()) {
			if (event.kind === "player") {
				localPlayer.userId = event.userId;
			} else if (event.kind === "character") {
				localPlayer.character = event.character;
			} else if (event.kind === "fire") {
				if (localPlayer.userId === 0) continue;
				const events = network.events;
				if (events === undefined) continue;
				localPlayer.shotSequence += 1;
				const bytes = fireWeaponRequestSerializer.serialize(
					new FireWeaponRequestPayload(
						localPlayer.userId,
						localPlayer.shotSequence,
						event.origin,
						event.direction,
					),
				);
				events.fireWeapon.fire(bytes.buffer);
			} else if (event.kind === "restart") {
				if (!hud.gameOver) continue;
				const events = network.events;
				if (events === undefined) continue;
				const bytes = restartRequestSerializer.serialize(new RestartRequestPayload(tick()));
				events.requestRestart.fire(bytes.buffer);
			}
		}
	}
}
