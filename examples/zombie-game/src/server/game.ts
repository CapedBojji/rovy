import { App } from "@rovy/core";
import { WorldInspectorServerPlugin } from "@rovy/world-inspector";
import {
	FireWeaponRequestPayload,
	INITIAL_INTERMISSION_SECONDS,
	PLAYER_MAX_HEALTH,
	RestartRequestPayload,
	SERVER_FIXED_DELTA,
	ZombieGameSmokeResult,
} from "shared/contracts";
import { toFireWeaponRequestNet, toRestartRequestNet } from "shared/network";
import "./components";
import "./collectors";
import "./systems";

export * from "./components";
export * from "./state";
export * from "./resources";
export {
	enqueueSmokeCharacterAdded,
	enqueueSmokeCharacterRemoving,
	enqueueSmokePlayerAdded,
	enqueueSmokePlayerRemoving,
} from "./collectors";
export { SnapshotState } from "./resources";

import {
	enqueueSmokePlayerAdded,
} from "./collectors";
import { Health, Position } from "./components";
import {
	CleanupSet,
	CombatSet,
	IngressSet,
	MovementSet,
	RemoteIngressSet,
	SnapshotSet,
	Update,
	WaveSet,
} from "./state";
import { ArenaState, DevPauseState, PlayerRegistry, SmokeStats, SnapshotState, WaveState } from "./resources";

export function boot(): App {
	const app = new App();
	app.configureSets(Update, [IngressSet, RemoteIngressSet, WaveSet, MovementSet, CombatSet, CleanupSet, SnapshotSet]);
	app.addPlugin(new WorldInspectorServerPlugin({
		schedule: Update,
		access: () => true,
	}));
	app.start();
	return app;
}

export function setPlayerPosition(app: App, userId: number, position: Vector3): void {
	const registry = app.world.resource(PlayerRegistry);
	const entity = registry.entitiesByUserId.get(userId);
	if (entity === undefined) return;
	app.world.set(entity, Position, new Position(position));
}

export function stepFixed(app: App): void {
	app.runSchedule(Update);
}

export function runZombieGameSmoke(): ZombieGameSmokeResult {
	const app = boot();
	const userId = 1001;
	const arena = app.world.resource(ArenaState);

	enqueueSmokePlayerAdded(userId);
	stepFixed(app);
	setPlayerPosition(app, userId, arena.center);

	const pause = app.world.resource(DevPauseState);
	const waveBeforePause = app.world.resource(WaveState).waveNumber;
	const intermissionBeforePause = app.world.resource(WaveState).intermissionRemaining;
	pause.paused = true;
	for (let i = 0; i < 8; i++) stepFixed(app);
	const pausedWave = app.world.resource(WaveState);
	const pauseFreezeVerified =
		pausedWave.waveNumber === waveBeforePause &&
		pausedWave.intermissionRemaining === intermissionBeforePause;
	pause.paused = false;

	let ticksRan = 0;
	const stepN = (count: number) => {
		for (let i = 0; i < count; i++) {
			stepFixed(app);
			ticksRan += 1;
		}
	};

	const intermissionTicks = math.ceil(INITIAL_INTERMISSION_SECONDS / SERVER_FIXED_DELTA) + 4;
	stepN(intermissionTicks);

	for (let attempt = 0; attempt < 240; attempt++) {
		const stats = app.world.resource(SmokeStats);
		if (stats.zombiesKilled > 0) break;
		app.commands.send(
			toFireWeaponRequestNet(
				new FireWeaponRequestPayload(userId, attempt, arena.center, new Vector3(1, 0, 0)),
			),
		);
		stepN(8);
	}

	const registry = app.world.resource(PlayerRegistry);
	const playerEntity = registry.entitiesByUserId.get(userId)!;
	for (let attempt = 0; attempt < 300; attempt++) {
		const health = app.world.get(playerEntity, Health);
		if (health !== undefined && health.current <= 0) break;
		stepN(2);
		const after = app.world.get(playerEntity, Health);
		if (after !== undefined && after.current > 0) {
			const nextHealth = math.max(0, after.current - 12);
			app.world.set(playerEntity, Health, new Health(nextHealth, after.max));
		}
	}

	stepN(2);
	const defeatReached = app.world.resource(WaveState).phase === "defeat";

	app.commands.send(toRestartRequestNet(new RestartRequestPayload(0)));
	stepN(2);

	const wave = app.world.resource(WaveState);
	const stats = app.world.resource(SmokeStats);
	const snap = app.world.resource(SnapshotState);
	const playerHealth = app.world.get(playerEntity, Health);

	return {
		started: app.isStarted(),
		ticksRan,
		waveNumber: wave.waveNumber,
		phase: wave.phase,
		zombiesSpawned: stats.zombiesSpawned,
		zombiesKilled: stats.zombiesKilled,
		shotsFired: stats.shotsFired,
		playerHealth: playerHealth?.current ?? 0,
		defeatReached,
		restartApplied: stats.restartApplied,
		snapshotCount: snap.snapshotCount,
		pauseFreezeVerified,
	};
}
