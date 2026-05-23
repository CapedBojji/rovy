import type { App, Plugin } from "@rovy/core";
import { ResMut, plugin, schedule, system } from "@rovy/core";
import { GameClock } from "../registry";

@plugin
export class GameClockPlugin implements Plugin {
	build(_app: App): void {}
}

@schedule
export class GameClockUpdate {}

@system({ schedule: GameClockUpdate })
class GameClockTick {
	run(clock: ResMut<GameClock>): void {
		clock.tick += 1;
	}
}
