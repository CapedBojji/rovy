import { App } from "@rovy/core";
import {
	FireWeaponRequestPayload,
	INITIAL_INTERMISSION_SECONDS,
	PLAYER_MAX_HEALTH,
	SERVER_FIXED_DELTA,
} from "shared/contracts";
import { toFireWeaponRequestNet, toRestartRequestNet } from "shared/network";
import { Health, Position } from "./components";
import { enqueueSmokeCharacterAdded, enqueueSmokePlayerAdded } from "./collectors";
import { boot, stepFixed } from "./game";
import { ArenaState, PlayerRegistry, SmokeStats, SnapshotState, WaveState } from "./resources";

export interface ZombieRobloxDriverResult {
	readonly started: boolean;
	readonly rootSynced: boolean;
	readonly zombiesSpawned: number;
	readonly zombiesKilled: number;
	readonly shotsFired: number;
	readonly snapshotCount: number;
	readonly defeatReached: boolean;
	readonly restartApplied: boolean;
	readonly phase: string;
	readonly waveNumber: number;
	readonly playerHealth: number;
}

interface MockCharacter {
	readonly character: Model;
	readonly root: Part;
}

function createMockCharacter(position: Vector3): MockCharacter {
	const character = new Instance("Model");
	character.Name = "TestCharacter";

	const root = new Instance("Part");
	root.Name = "HumanoidRootPart";
	root.Anchored = true;
	root.CanCollide = false;
	root.Size = new Vector3(2, 2, 1);
	root.Position = position;
	root.Parent = character;

	character.PrimaryPart = root;
	character.Parent = game.GetService("Workspace");

	return { character, root };
}

class ZombieRobloxTestDriver {
	readonly app: App;
	readonly userId = 7001;
	readonly character: Model;
	readonly root: Part;

	constructor() {
		this.app = boot();
		const arena = this.app.world.resource(ArenaState);
		const mock = createMockCharacter(arena.center);
		this.character = mock.character;
		this.root = mock.root;

		enqueueSmokePlayerAdded(this.userId);
		enqueueSmokeCharacterAdded(this.userId, this.character);
		this.step(1);
	}

	moveTo(position: Vector3): void {
		this.root.Position = position;
		this.step(1);
	}

	fire(direction: Vector3, shotSequence: number): void {
		this.app.commands.send(
			toFireWeaponRequestNet(new FireWeaponRequestPayload(this.userId, shotSequence, this.root.Position, direction)),
		);
		this.step(1);
	}

	forceDefeat(): void {
		const registry = this.app.world.resource(PlayerRegistry);
		const entity = registry.entitiesByUserId.get(this.userId);
		if (entity === undefined) return;
		this.app.world.set(entity, Health, new Health(0, PLAYER_MAX_HEALTH));
		this.step(2);
	}

	restart(): void {
		this.app.commands.send(toRestartRequestNet({ clientTime: 0 }));
		this.step(2);
	}

	step(count: number): void {
		for (let i = 0; i < count; i++) {
			stepFixed(this.app);
		}
	}

	destroy(): void {
		this.character.Destroy();
	}
}

export function runTowerRobloxDriverSmoke(): ZombieRobloxDriverResult {
	const driver = new ZombieRobloxTestDriver();
	const arena = driver.app.world.resource(ArenaState);
	driver.moveTo(arena.center);

	const registry = driver.app.world.resource(PlayerRegistry);
	const playerEntity = registry.entitiesByUserId.get(driver.userId)!;
	const syncedPosition = driver.app.world.get(playerEntity, Position)?.value;
	const rootSynced = syncedPosition !== undefined && syncedPosition.sub(driver.root.Position).Magnitude < 0.01;

	const intermissionTicks = math.ceil(INITIAL_INTERMISSION_SECONDS / SERVER_FIXED_DELTA) + 4;
	driver.step(intermissionTicks);

	for (let attempt = 0; attempt < 240; attempt++) {
		const stats = driver.app.world.resource(SmokeStats);
		if (stats.zombiesKilled > 0) break;
		driver.fire(new Vector3(1, 0, 0), attempt);
		driver.step(8);
	}

	driver.forceDefeat();
	const defeatReached = driver.app.world.resource(WaveState).phase === "defeat";
	driver.restart();

	const wave = driver.app.world.resource(WaveState);
	const stats = driver.app.world.resource(SmokeStats);
	const snap = driver.app.world.resource(SnapshotState);
	const playerHealth = driver.app.world.get(playerEntity, Health);

	const result = {
		started: driver.app.isStarted(),
		rootSynced,
		zombiesSpawned: stats.zombiesSpawned,
		zombiesKilled: stats.zombiesKilled,
		shotsFired: stats.shotsFired,
		snapshotCount: snap.snapshotCount,
		defeatReached,
		restartApplied: stats.restartApplied,
		phase: wave.phase,
		waveNumber: wave.waveNumber,
		playerHealth: playerHealth?.current ?? 0,
	};

	driver.destroy();
	return result;
}
