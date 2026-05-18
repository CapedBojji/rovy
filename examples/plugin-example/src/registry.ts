import { rovy } from "@rovy/core";

export const GAME_CLOCK_PARAM = "@rovy/example-gameclock/GameClock";

export class GameClock {
	tick = 0;
}

rovy.__resource(GameClock, "@rovy/example-gameclock/GameClock");
