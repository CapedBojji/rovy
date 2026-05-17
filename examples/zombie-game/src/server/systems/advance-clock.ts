import { ResMut, system } from "@rovy/core";
import { ServerClock } from "../resources";
import { Update, WaveSet } from "../state";

@system({ schedule: Update, set: WaveSet })
export class AdvanceClock {
	run(clock: ResMut<ServerClock>) {
		clock.tick += 1;
	}
}
