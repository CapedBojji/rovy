import { ResMut, system } from "@rovy/core";
import { NetClient } from "@rovy/networking";
import { ClientHeartbeatPayload } from "shared/contracts";
import { toClientHeartbeatNet } from "shared/network";
import { ClientClock, ClientPlaybackState } from "../resources";
import { FrameSet, Render } from "../state";

@system({ schedule: Render, set: FrameSet })
export class TickClientClock {
	run(clock: ResMut<ClientClock>, playback: ResMut<ClientPlaybackState>, network: NetClient) {
		clock.now += clock.delta;
		clock.frame += 1;
		clock.nextHeartbeatIn -= clock.delta;
		if (clock.nextHeartbeatIn > 0) return;
		network.send(toClientHeartbeatNet(new ClientHeartbeatPayload(clock.frame, clock.now, playback.lastSnapshotTick)));
		clock.nextHeartbeatIn = 1;
		playback.lastClientHeartbeatFrame = clock.frame;
	}
}
