import {
	FireWeaponRequestPayload,
	RestartRequestPayload,
} from "shared/contracts";
import { Res, ResMut, system } from "@rovy/core";
import { NetClient } from "@rovy/networking";
import { LocalClientCollect } from "../collectors";
import { HudState, LocalPlayerState } from "../resources";
import { InputSet, Render } from "../state";
import { toFireWeaponRequestNet, toRestartRequestNet } from "shared/network";

@system({ schedule: Render, set: InputSet })
export class ApplyLocalIngress {
	run(
		ingress: LocalClientCollect,
		network: NetClient,
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
				localPlayer.shotSequence += 1;
				network.send(
					toFireWeaponRequestNet(
					new FireWeaponRequestPayload(
						localPlayer.userId,
						localPlayer.shotSequence,
						event.origin,
						event.direction,
					),
					),
				);
			} else if (event.kind === "restart") {
				if (!hud.gameOver) continue;
				network.send(toRestartRequestNet(new RestartRequestPayload(tick())));
			}
		}
	}
}
