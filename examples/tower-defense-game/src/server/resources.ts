import { inspect, resource } from "@rovy/core";
import {
	MAX_ACTIVE_MONSTERS,
	MONSTER_SPAWN_INTERVAL,
	PATH_END_X,
	PATH_START_X,
	PATH_Y,
	PATH_Z,
	SERVER_FIXED_DELTA,
	TURRET_POSITION,
} from "shared/contracts";

@inspect
@resource
export class ServerClock {
	tick = 0;
	simTime = 0;
	fixedDelta = SERVER_FIXED_DELTA;
}

@inspect
@resource
export class SpawnState {
	nextSpawnIn = 0;
	spawnInterval = MONSTER_SPAWN_INTERVAL;
	maxActive = MAX_ACTIVE_MONSTERS;
	nextSpawnIndex = 1;
}

@inspect
@resource
export class TowerDefenseStats {
	monstersSpawned = 0;
	monstersKilled = 0;
	monstersEscaped = 0;
	damageEvents = 0;
	totalLeakDamage = 0;
	shotsFired = 0;
	maxActiveMonstersObserved = 0;
	lastDamageTick = 0;
	lastDamageAmount = 0;
	lastEscapedMonsterId = 0;
}

@inspect
@resource
export class TurretState {
	position = TURRET_POSITION;
	cooldown = 0;
	lastTargetId = 0;
	lastShotTick = 0;
}

@inspect
@resource
export class SnapshotState {
	sendAccumulator = 0;
	snapshotCount = 0;
}

@inspect
@resource
export class ClientSignalState {
	lastClientFrame = 0;
	lastClientTime = 0;
	lastClientSnapshotTick = 0;
	heartbeatsReceived = 0;
}

@resource
export class PathState {
	start = new Vector3(PATH_START_X, PATH_Y, PATH_Z);
	end = new Vector3(PATH_END_X, PATH_Y, PATH_Z);
}

@resource
export class WireIdAllocator {
	private nextId = 1;

	allocate(): number {
		const id = this.nextId;
		this.nextId += 1;
		return id;
	}
}
