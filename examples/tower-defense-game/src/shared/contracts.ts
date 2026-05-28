export type TowerWavePhase = "running";

export const SERVER_TICK_HZ = 30;
export const SERVER_FIXED_DELTA = 1 / SERVER_TICK_HZ;
export const SNAPSHOT_INTERVAL = 0.1;

export const PATH_START_X = -78;
export const PATH_END_X = 78;
export const PATH_Y = 3;
export const PATH_Z = 0;
export const PATH_LENGTH = PATH_END_X - PATH_START_X;

export const TURRET_POSITION = new Vector3(0, PATH_Y + 3, -15);
export const TURRET_RANGE = 28;
export const TURRET_FIRE_COOLDOWN = 0.4;
export const PROJECTILE_SPEED = 96;
export const PROJECTILE_DAMAGE = 100;
export const PROJECTILE_RADIUS = 1.4;
export const PROJECTILE_LIFETIME = 1.1;

export const MAX_ACTIVE_MONSTERS = 3;
export const MONSTER_SPAWN_INTERVAL = 3;
export const MONSTER_SPEED = 18;
export const MONSTER_HEALTH = 100;
export const MONSTER_RADIUS = 2.4;
export const BASE_LEAK_DAMAGE = 1;

export interface MonsterSnapshot {
	id: number;
	position: Vector3;
	health: number;
	maxHealth: number;
	progress: number;
	spawnIndex: number;
	willBeHit: boolean;
	shotTaken: boolean;
}

export interface ProjectileSnapshot {
	id: number;
	position: Vector3;
}

export class TowerSnapshotPayload {
	constructor(
		public serverTick: number = 0,
		public simTime: number = 0,
		public phase: TowerWavePhase = "running",
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
		public monsters: Array<MonsterSnapshot> = [],
		public projectiles: Array<ProjectileSnapshot> = [],
	) {}
}

export class ClientHeartbeatPayload {
	constructor(
		public clientFrame: number = 0,
		public clientTime: number = 0,
		public lastSnapshotTick: number = 0,
	) {}
}

export interface TowerDefenseSmokeResult {
	readonly started: boolean;
	readonly ticksRan: number;
	readonly monstersSpawned: number;
	readonly monstersKilled: number;
	readonly monstersEscaped: number;
	readonly damageEvents: number;
	readonly shotsFired: number;
	readonly snapshotCount: number;
	readonly maxActiveMonstersObserved: number;
	readonly clientHeartbeatApplied: boolean;
}
