import type { App, Plugin, RovyRegistry, ParamDescriptor, Ctor } from "@rovy/core";
import { registerAppExtension, rovy } from "@rovy/core";
import { GameClock, GAME_CLOCK_PARAM } from "./registry";

export interface GameClockOptions {
	/** Schedule the tick system runs in. Omit to skip auto-registration. */
	readonly schedule?: Ctor;
}

export class GameClockPlugin implements Plugin {
	private readonly clock = new GameClock();

	constructor(private readonly options: GameClockOptions = {}) {}

	build(app: App): void {
		const clock = this.clock;
		app.insertParam(GAME_CLOCK_PARAM, clock);

		const schedule = this.options.schedule;
		if (schedule === undefined) return;

		class GameClockTick {
			run(): void {
				clock.tick += 1;
				print(`[gameclock] tick ${clock.tick}`);
			}
		}
		rovy.__system(GameClockTick as unknown as Ctor, {
			id: "@rovy/example-gameclock/GameClockTick",
			schedule,
			params: [],
		});
	}
}

function paramsNeedClock(params: ReadonlyArray<ParamDescriptor>): boolean {
	return params.some((p) => p.kind === "external" && p.id === GAME_CLOCK_PARAM);
}

function registryNeedsClock(registry: RovyRegistry): boolean {
	for (const sys of registry.systems) if (paramsNeedClock(sys.params)) return true;
	for (const obs of registry.observers) if (paramsNeedClock(obs.params)) return true;
	for (const mon of registry.monitors) if (paramsNeedClock(mon.params)) return true;
	return false;
}

registerAppExtension((app, registry) => {
	if (!registryNeedsClock(registry)) return;
	const schedule = registry.schedules[0]?.ctor;
	app.addPlugin(new GameClockPlugin({ schedule }));
});
