import { App, type Plugin } from "@rovy/core";
import { WorldInspectorServerPlugin } from "@rovy/world-inspector";
import { ClientHeartbeatPayload, SERVER_FIXED_DELTA, TowerDefenseSmokeResult } from "shared/contracts";
import { toClientHeartbeatNet } from "shared/network";
import "./components";
import "./events";
import "./systems";

export * from "./components";
export * from "./events";
export * from "./resources";
export * from "./state";

import {
	CleanupSet,
	CombatSet,
	IngressSet,
	MovementSet,
	SnapshotSet,
	SpawnSet,
	Update,
} from "./state";
import { ClientSignalState, SnapshotState, TowerDefenseStats } from "./resources";

export function boot(): App {
	const app = new App();
	app.configureSets(Update, [IngressSet, SpawnSet, CombatSet, MovementSet, CleanupSet, SnapshotSet]);
	app.addPlugin(new WorldInspectorServerPlugin({
		schedule: Update,
		access: () => true,
	}) as unknown as Plugin);
	app.start();
	return app;
}

export function stepFixed(app: App): void {
	app.runSchedule(Update);
}

export function runTowerDefenseSmoke(): TowerDefenseSmokeResult {
	const app = boot();
	let ticksRan = 0;

	app.commands.send(toClientHeartbeatNet(new ClientHeartbeatPayload(7, 0.25, 3)));
	for (let i = 0; i < math.ceil(18 / SERVER_FIXED_DELTA); i++) {
		stepFixed(app);
		ticksRan += 1;
	}

	const stats = app.world.resource(TowerDefenseStats);
	const snap = app.world.resource(SnapshotState);
	const client = app.world.resource(ClientSignalState);
	return {
		started: app.isStarted(),
		ticksRan,
		monstersSpawned: stats.monstersSpawned,
		monstersKilled: stats.monstersKilled,
		monstersEscaped: stats.monstersEscaped,
		damageEvents: stats.damageEvents,
		shotsFired: stats.shotsFired,
		snapshotCount: snap.snapshotCount,
		maxActiveMonstersObserved: stats.maxActiveMonstersObserved,
		clientHeartbeatApplied: client.heartbeatsReceived >= 1 && client.lastClientFrame === 7,
	};
}
