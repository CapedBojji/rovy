import { ResMut, system } from "@rovy/core";
import { ServerClock } from "../resources";
import { Update } from "../state";

@system({ schedule: Update })
export class AdvanceClock {
	run(clock: ResMut<ServerClock>) {
		clock.tick += 1;
		clock.simTime += clock.fixedDelta;
	}
}
