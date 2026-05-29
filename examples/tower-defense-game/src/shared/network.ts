import { netEvent } from "@rovy/networking";
import { ClientHeartbeatPayload, TowerSnapshotPayload } from "./contracts";

type WireVector3 = { x: number; y: number; z: number };
type WireMonsterSnapshot = {
	id: number;
	position: WireVector3;
	health: number;
	maxHealth: number;
	progress: number;
	spawnIndex: number;
	willBeHit: boolean;
	shotTaken: boolean;
};
type WireProjectileSnapshot = {
	id: number;
	position: WireVector3;
};

@netEvent({ direction: "serverToClient", receive: "send" })
export class TowerSnapshotNet {
	constructor(
		public serverTick: number = 0,
		public simTime: number = 0,
		public phase: string = "running",
		public monstersSpawned: number = 0,
		public monstersKilled: number = 0,
		public monstersEscaped: number = 0,
		public damageEvents: number = 0,
		public totalLeakDamage: number = 0,
		public shotsFired: number = 0,
		public activeMonsters: number = 0,
		public activeProjectiles: number = 0,
		public lastDamageTick: number = 0,
		public lastDamageAmount: number = 0,
		public lastClientFrame: number = 0,
		public monsters: Array<WireMonsterSnapshot> = [],
		public projectiles: Array<WireProjectileSnapshot> = [],
	) {}
}

@netEvent({ direction: "clientToServer", receive: "send" })
export class ClientHeartbeatNet {
	constructor(
		public clientFrame: number = 0,
		public clientTime: number = 0,
		public lastSnapshotTick: number = 0,
	) {}
}

function toWireVector3(value: Vector3): WireVector3 {
	return { x: value.X, y: value.Y, z: value.Z };
}

function fromWireVector3(value: WireVector3): Vector3 {
	return new Vector3(value.x, value.y, value.z);
}

export function toTowerSnapshotNet(payload: TowerSnapshotPayload): TowerSnapshotNet {
	return new TowerSnapshotNet(
		payload.serverTick,
		payload.simTime,
		payload.phase,
		payload.monstersSpawned,
		payload.monstersKilled,
		payload.monstersEscaped,
		payload.damageEvents,
		payload.totalLeakDamage,
		payload.shotsFired,
		payload.activeMonsters,
		payload.activeProjectiles,
		payload.lastDamageTick,
		payload.lastDamageAmount,
		payload.lastClientFrame,
		payload.monsters.map((monster) => ({
			id: monster.id,
			position: toWireVector3(monster.position),
			health: monster.health,
			maxHealth: monster.maxHealth,
			progress: monster.progress,
			spawnIndex: monster.spawnIndex,
			willBeHit: monster.willBeHit,
			shotTaken: monster.shotTaken,
		})),
		payload.projectiles.map((projectile) => ({
			id: projectile.id,
			position: toWireVector3(projectile.position),
		})),
	);
}

export function fromTowerSnapshotNet(event: TowerSnapshotNet): TowerSnapshotPayload {
	return new TowerSnapshotPayload(
		event.serverTick,
		event.simTime,
		event.phase as "running",
		event.monstersSpawned,
		event.monstersKilled,
		event.monstersEscaped,
		event.damageEvents,
		event.totalLeakDamage,
		event.shotsFired,
		event.activeMonsters,
		event.activeProjectiles,
		event.lastDamageTick,
		event.lastDamageAmount,
		event.lastClientFrame,
		event.monsters.map((monster) => ({
			id: monster.id,
			position: fromWireVector3(monster.position),
			health: monster.health,
			maxHealth: monster.maxHealth,
			progress: monster.progress,
			spawnIndex: monster.spawnIndex,
			willBeHit: monster.willBeHit,
			shotTaken: monster.shotTaken,
		})),
		event.projectiles.map((projectile) => ({
			id: projectile.id,
			position: fromWireVector3(projectile.position),
		})),
	);
}

export function toClientHeartbeatNet(payload: ClientHeartbeatPayload): ClientHeartbeatNet {
	return new ClientHeartbeatNet(payload.clientFrame, payload.clientTime, payload.lastSnapshotTick);
}

export function fromClientHeartbeatNet(event: ClientHeartbeatNet): ClientHeartbeatPayload {
	return new ClientHeartbeatPayload(event.clientFrame, event.clientTime, event.lastSnapshotTick);
}
