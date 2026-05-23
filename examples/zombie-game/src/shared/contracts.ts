/**
 * Shared cross-realm contracts for the zombie-game example.
 *
 * Shared gameplay payloads for the zombie-game example.
 */

/** Phase of the round shown in the HUD. */
export type WavePhase = "intermission" | "wave" | "defeat";

/** Server tick rate (Hz). */
export const SERVER_TICK_HZ = 30;
export const SERVER_FIXED_DELTA = 1 / SERVER_TICK_HZ;

/** How often the server broadcasts a snapshot to clients (seconds). */
export const SNAPSHOT_INTERVAL = 0.1;
export const SNAPSHOT_HZ = 1 / SNAPSHOT_INTERVAL;

/** Player gameplay constants. */
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_RADIUS = 2.5;

/** Weapon / projectile constants. */
export const WEAPON_COOLDOWN = 0.2;
export const PROJECTILE_SPEED = 110;
export const PROJECTILE_LIFETIME = 1.5;
export const PROJECTILE_RADIUS = 0.75;
export const PROJECTILE_DAMAGE = 34;

/** Zombie constants (scaled per wave). */
export const ZOMBIE_BASE_HEALTH = 60;
export const ZOMBIE_HEALTH_PER_WAVE = 12;
export const ZOMBIE_BASE_SPEED = 10;
export const ZOMBIE_SPEED_PER_WAVE = 1;
export const ZOMBIE_MAX_SPEED_BONUS = 6;
export const ZOMBIE_RADIUS = 2.5;
export const ZOMBIE_CONTACT_DAMAGE = 8;
export const ZOMBIE_CONTACT_COOLDOWN = 0.5;

/** Wave timing. */
export const INITIAL_INTERMISSION_SECONDS = 2;
export const REGULAR_INTERMISSION_SECONDS = 3;
export const ZOMBIE_SPAWN_INTERVAL = 0.45;

/** Arena dimensions. */
export const ARENA_HALF_SIZE = 96;
export const ZOMBIE_SPAWN_RADIUS = 64;

/** Anti-spoof clamp for client-reported origin (studs). */
export const SHOT_ORIGIN_CLAMP_RADIUS = 6;

// ── Snapshot wire data ──────────────────────────────────────────────────────

export interface ZombieSnapshot {
	id: number;
	position: Vector3;
	health: number;
	maxHealth: number;
}

export interface ProjectileSnapshot {
	id: number;
	position: Vector3;
}

export class WorldSnapshotPayload {
	constructor(
		public serverTick: number = 0,
		public phase: WavePhase = "intermission",
		public waveNumber: number = 0,
		public enemiesRemaining: number = 0,
		public playerHealth: number = 0,
		public playerMaxHealth: number = PLAYER_MAX_HEALTH,
		public playerPosition: Vector3 = new Vector3(),
		public zombies: Array<ZombieSnapshot> = [],
		public projectiles: Array<ProjectileSnapshot> = [],
		public paused: boolean = false,
	) {}
}

export class FireWeaponRequestPayload {
	constructor(
		public shooterUserId: number = 0,
		public shotSequence: number = 0,
		public origin: Vector3 = new Vector3(),
		public direction: Vector3 = new Vector3(0, 0, -1),
	) {}
}

export class RestartRequestPayload {
	constructor(public clientTime: number = 0) {}
}

export class TogglePauseRequestPayload {
	constructor(public paused: boolean = false) {}
}

// ── Smoke result (server-side test export) ──────────────────────────────────

export interface ZombieGameSmokeResult {
	readonly started: boolean;
	readonly ticksRan: number;
	readonly waveNumber: number;
	readonly phase: string;
	readonly zombiesSpawned: number;
	readonly zombiesKilled: number;
	readonly shotsFired: number;
	readonly playerHealth: number;
	readonly defeatReached: boolean;
	readonly restartApplied: boolean;
	readonly snapshotCount: number;
	readonly pauseFreezeVerified: boolean;
}
