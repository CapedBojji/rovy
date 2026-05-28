import { EventReader, ResMut, system } from "@rovy/core";
import { ClientHeartbeatNet, fromClientHeartbeatNet } from "shared/network";
import { ClientSignalState } from "../resources";
import { IngressSet, Update } from "../state";

@system({ schedule: Update, set: IngressSet })
export class ApplyClientHeartbeat {
	run(events: EventReader<ClientHeartbeatNet>, signal: ResMut<ClientSignalState>) {
		events.forEach((event) => {
			const payload = fromClientHeartbeatNet(event);
			signal.lastClientFrame = payload.clientFrame;
			signal.lastClientTime = payload.clientTime;
			signal.lastClientSnapshotTick = payload.lastSnapshotTick;
			signal.heartbeatsReceived += 1;
		});
	}
}
