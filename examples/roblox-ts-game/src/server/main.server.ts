import { App, rovy } from "@rovy/core";

export interface IntegrationSmokeResult {
	readonly started: boolean;
	readonly spawned: number;
	readonly pulses: number;
	readonly observed: number;
	readonly deadEntered: number;
	readonly finalHealth: number;
	readonly traitId: string;
}

function loadGameModule() {
	const shared = game.GetService("ReplicatedStorage").WaitForChild("TS");
	const module = shared.WaitForChild("module") as ModuleScript;
	return require(module) as typeof import("shared/module");
}

export function runIntegrationSmoke(): IntegrationSmokeResult {
	rovy.__reset();
	rovy.loadPaths("src/shared");

	const gameModule = loadGameModule();
	const app = new App();
	app.start();

	gameModule.seed(app);
	app.runSchedule(gameModule.Update);

	const result = app.world.resource(gameModule.SmokeResult);
	return {
		started: app.isStarted(),
		spawned: result.spawned,
		pulses: result.pulses,
		observed: result.observed,
		deadEntered: result.deadEntered,
		finalHealth: result.finalHealth,
		traitId: result.traitId,
	};
}
