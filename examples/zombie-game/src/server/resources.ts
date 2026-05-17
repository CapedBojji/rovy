import { Entity, resource } from "@rovy/core";
import {
	ARENA_HALF_SIZE,
	INITIAL_INTERMISSION_SECONDS,
	SERVER_FIXED_DELTA,
	WavePhase,
	ZOMBIE_SPAWN_RADIUS,
} from "shared/contracts";

@resource
export class ServerClock {
	tick = 0;
	fixedDelta = SERVER_FIXED_DELTA;
}

@resource
export class WaveState {
	phase: WavePhase = "intermission";
	waveNumber = 0;
	intermissionRemaining = INITIAL_INTERMISSION_SECONDS;
	spawnRemaining = 0;
	spawnCooldown = 0;
	spawnIndex = 0;
}

@resource
export class PlayerRegistry {
	entitiesByUserId = new Map<number, Entity>();
	charactersByUserId = new Map<number, defined>();
}

@resource
export class ArenaState {
	readonly center = new Vector3(0, 3, 0);
	readonly halfSize = ARENA_HALF_SIZE;
	readonly zombieSpawnRadius = ZOMBIE_SPAWN_RADIUS;
}

@resource
export class SnapshotState {
	sendAccumulator = 0;
	snapshotCount = 0;
}

@resource
export class SmokeStats {
	zombiesSpawned = 0;
	zombiesKilled = 0;
	shotsFired = 0;
	restartApplied = false;
}

@resource
export class WireIdAllocator {
	private nextId = 1;

	allocate(): number {
		const id = this.nextId;
		this.nextId += 1;
		return id;
	}

	reset(): void {
		this.nextId = 1;
	}
}
