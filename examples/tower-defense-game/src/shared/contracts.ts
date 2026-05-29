/**
 * Shared cross-realm contracts for the tower-defense-game example.
 *
 * Shared gameplay payloads for the tower-defense-game example.
 */

/** Phase of the round shown in the HUD. */
export type WavePhase = "intermission" | "wave" | "defeat";

/** Server tick rate (Hz). */
export const SERVER_TICK_HZ = 30;
export const SERVER_FIXED_DELTA = 1 / SERVER_TICK_HZ;

/** How often the server broadcasts a snapshot to clients (seconds). */
export const SNAPSHOT_INTERVAL = 0.1;
export const SNAPSHOT_HZ = 1 / SNAPSHOT_INTERVAL;

/** Base gameplay constants. Kept under existing HUD-facing names. */
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_RADIUS = 4;

/** Tower / projectile constants. */
export const WEAPON_COOLDOWN = 0.45;
export const PROJECTILE_SPEED = 140;
export const PROJECTILE_LIFETIME = 1.2;
export const PROJECTILE_RADIUS = 1;
export const PROJECTILE_DAMAGE = 100;
export const TOWER_FIRE_COOLDOWN = 0.45;
export const TOWER_RANGE = 42;
export const TOWER_POSITION = new Vector3(0, 7, -18);

/** Path enemy constants (kept under existing wire/HUD names). */
export const ZOMBIE_BASE_HEALTH = 100;
export const ZOMBIE_HEALTH_PER_WAVE = 18;
export const ZOMBIE_BASE_SPEED = 16;
export const ZOMBIE_SPEED_PER_WAVE = 1.25;
export const ZOMBIE_MAX_SPEED_BONUS = 8;
export const ZOMBIE_RADIUS = 2.4;
export const ZOMBIE_CONTACT_DAMAGE = 1;
export const ZOMBIE_CONTACT_COOLDOWN = 0.5;

/** Wave timing. */
export const INITIAL_INTERMISSION_SECONDS = 2;
export const REGULAR_INTERMISSION_SECONDS = 3;
export const ZOMBIE_SPAWN_INTERVAL = 1.1;

/** Arena dimensions. */
export const ARENA_HALF_SIZE = 96;
export const ZOMBIE_SPAWN_RADIUS = 0;
export const PATH_START_X = -78;
export const PATH_END_X = 78;
export const PATH_Y = 3;
export const PATH_Z = 0;
export const PATH_LENGTH = PATH_END_X - PATH_START_X;
export const BASE_LEAK_DAMAGE = 1;

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
		public score: number = 0,
		public kills: number = 0,
		public shotsFired: number = 0,
		public combo: number = 0,
		public bestCombo: number = 0,
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
	readonly score: number;
	readonly bestCombo: number;
	readonly scoreResetVerified: boolean;
}
