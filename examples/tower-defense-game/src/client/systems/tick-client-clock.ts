import { ResMut, system } from "@rovy/core";
import { ClientClock } from "../resources";
import { FrameSet, Render } from "../state";

@system({ schedule: Render, set: FrameSet })
export class TickClientClock {
	run(clock: ResMut<ClientClock>) {
		clock.now += clock.delta;
	}
}
