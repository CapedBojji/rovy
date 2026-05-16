/**
 * Server-side Rovy runtime for the zombie-game example.
 *
 * Owns the whole simulation:
 *   * waves spawn zombies at deterministic ring positions
 *   * zombies steer straight at the nearest player and deal contact damage
 *   * projectiles travel a fixed velocity for a fixed lifetime
 *   * shots become projectiles via an observer on a Rovy event
 *   * defeat/restart are pure ECS state transitions
 *   * a snapshot system serializes the world for the network bridge
 *
 * Engine concerns (player join, character spawn, networking, tool creation)
 * live in `main.server.ts`; this file is engine-agnostic so the lune smoke
 * helper can drive it with synthetic positions.
 */

import {
	App,
	Commands,
	Entity,
	EventReader,
	EventWriter,
	Query,
	Res,
	ResMut,
	With,
	component,
	event,
	observer,
	resource,
	schedule,
	system,
	SystemSet,
} from "@rovy/core";

import {
	ARENA_HALF_SIZE,
	FireWeaponRequestPayload,
	INITIAL_INTERMISSION_SECONDS,
	PLAYER_MAX_HEALTH,
	PLAYER_RADIUS,
	PROJECTILE_DAMAGE,
	PROJECTILE_LIFETIME,
	PROJECTILE_RADIUS,
	PROJECTILE_SPEED,
	ProjectileSnapshot,
	REGULAR_INTERMISSION_SECONDS,
	SERVER_FIXED_DELTA,
	SHOT_ORIGIN_CLAMP_RADIUS,
	SNAPSHOT_INTERVAL,
	WEAPON_COOLDOWN,
	WavePhase,
	WorldSnapshotPayload,
	ZOMBIE_BASE_HEALTH,
	ZOMBIE_BASE_SPEED,
	ZOMBIE_CONTACT_COOLDOWN,
	ZOMBIE_CONTACT_DAMAGE,
	ZOMBIE_HEALTH_PER_WAVE,
	ZOMBIE_MAX_SPEED_BONUS,
	ZOMBIE_RADIUS,
	ZOMBIE_SPAWN_INTERVAL,
	ZOMBIE_SPAWN_RADIUS,
	ZOMBIE_SPEED_PER_WAVE,
	ZombieSnapshot,
	worldSnapshotSerializer,
} from "shared/contracts";

// ── Schedules ──────────────────────────────────────────────────────────────

@schedule
export class Startup {}

@schedule
export class Update {}

// ── Sets (declared in plan order, wired in `boot`) ─────────────────────────

export class WaveSet extends SystemSet {}
export class MovementSet extends SystemSet {}
export class CombatSet extends SystemSet {}
export class CleanupSet extends SystemSet {}
export class SnapshotSet extends SystemSet {}

// ── Resources ──────────────────────────────────────────────────────────────

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
	/** Increments per spawn so the ring is deterministic across resets. */
	spawnIndex = 0;
}

/**
 * Engine-facing maps. The smoke helper can populate these with synthetic
 * objects (anything with a `Position`/`Character` shape we can read).
 */
@resource
export class PlayerRegistry {
	/** userId → server entity id */
	entitiesByUserId = new Map<number, Entity>();
	/** userId → Roblox Player (real boot) or test stand-in */
	playersByUserId = new Map<number, defined>();
	/** userId → Roblox Model (real boot) or test stand-in */
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
	latestBytes?: buffer;
	snapshotCount = 0;
}

@resource
export class SmokeStats {
	zombiesSpawned = 0;
	zombiesKilled = 0;
	shotsFired = 0;
	restartApplied = false;
}

/** Allocates stable wire ids for snapshots (separate from jecs entity ids). */
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

// ── Components ─────────────────────────────────────────────────────────────

@component
export class PlayerUnit {
	constructor(public userId: number = 0) {}
}

@component
export class Zombie {}

@component
export class Projectile {
	constructor(public ownerUserId: number = 0) {}
}

@component
export class Position {
	constructor(public value: Vector3 = new Vector3()) {}
}

@component
export class Velocity {
	constructor(public value: Vector3 = new Vector3()) {}
}

@component
export class Health {
	constructor(
		public current = 0,
		public max = current,
	) {}
}

@component
export class Radius {
	constructor(public value: number = 1) {}
}

@component
export class MoveSpeed {
	constructor(public value: number = 0) {}
}

@component
export class Lifetime {
	constructor(public remaining: number = 0) {}
}

@component
export class Damage {
	constructor(public value: number = 0) {}
}

@component
export class WeaponCooldown {
	constructor(public remaining: number = 0) {}
}

@component
export class ContactCooldown {
	constructor(public remaining: number = 0) {}
}

/** Stable wire id attached to every snapshotable entity. */
@component
export class WireId {
	constructor(public value: number = 0) {}
}

// ── Events ─────────────────────────────────────────────────────────────────

@event({ capacity: 32 })
export class FireWeaponIntent {
	constructor(
		public shooterUserId = 0,
		public origin: Vector3 = new Vector3(),
		public direction: Vector3 = new Vector3(0, 0, -1),
	) {}
}

@event({ capacity: 8 })
export class RestartIntent {
	constructor(public requestedByUserId = 0) {}
}

// ── Helpers ────────────────────────────────────────────────────────────────

function zombieHealth(wave: number): number {
	return ZOMBIE_BASE_HEALTH + math.max(0, wave - 1) * ZOMBIE_HEALTH_PER_WAVE;
}

function zombieSpeed(wave: number): number {
	const bonus = math.min(math.max(0, wave - 1) * ZOMBIE_SPEED_PER_WAVE, ZOMBIE_MAX_SPEED_BONUS);
	return ZOMBIE_BASE_SPEED + bonus;
}

function quotaForWave(wave: number): number {
	return 4 + wave * 2;
}

const GOLDEN_ANGLE = math.pi * (3 - math.sqrt(5));

function ringSpawnPosition(arena: ArenaState, index: number): Vector3 {
	const angle = index * GOLDEN_ANGLE;
	const radius = arena.zombieSpawnRadius;
	const x = arena.center.X + math.cos(angle) * radius;
	const z = arena.center.Z + math.sin(angle) * radius;
	return new Vector3(x, arena.center.Y, z);
}

function horizontalDistance(a: Vector3, b: Vector3): number {
	const dx = a.X - b.X;
	const dz = a.Z - b.Z;
	return math.sqrt(dx * dx + dz * dz);
}

function horizontalDirection(from: Vector3, to: Vector3): Vector3 {
	const dx = to.X - from.X;
	const dz = to.Z - from.Z;
	const len = math.sqrt(dx * dx + dz * dz);
	if (len <= 1e-4) return new Vector3();
	return new Vector3(dx / len, 0, dz / len);
}

function safeNormalize(v: Vector3): Vector3 {
	const m = v.Magnitude;
	if (m <= 1e-4) return new Vector3(0, 0, -1);
	return v.div(m);
}

/** Pick the nearest living player entity to a world position, or undefined. */
function nearestPlayer(
	players: Query<[Entity, PlayerUnit, Position, Health]>,
	from: Vector3,
): { entity: Entity; position: Vector3 } | undefined {
	let bestEntity: Entity | undefined;
	let bestPos: Vector3 | undefined;
	let bestDist = math.huge;
	players.forEach((entity, _unit, pos, health) => {
		if (health.current <= 0) return;
		const d = horizontalDistance(pos.value, from);
		if (d < bestDist) {
			bestDist = d;
			bestEntity = entity;
			bestPos = pos.value;
		}
	});
	if (bestEntity === undefined || bestPos === undefined) return undefined;
	return { entity: bestEntity, position: bestPos };
}

// ── Systems ────────────────────────────────────────────────────────────────

@system({ schedule: Update, set: WaveSet })
class AdvanceClock {
	run(clock: ResMut<ServerClock>) {
		clock.tick += 1;
	}
}

@system({ schedule: Update, set: WaveSet })
class AdvanceWaveState {
	run(
		clock: Res<ServerClock>,
		wave: ResMut<WaveState>,
		zombies: Query<[Entity], With<Zombie>>,
		players: Query<[Entity, PlayerUnit, Health]>,
	) {
		const dt = clock.fixedDelta;

		// Defeat is sticky until a RestartIntent flips it.
		if (wave.phase === "defeat") return;

		// If no living players, drop into defeat.
		let anyAlive = false;
		players.forEach((_entity, _unit, health) => {
			if (health.current > 0) anyAlive = true;
		});
		if (!anyAlive && players.size() > 0) {
			wave.phase = "defeat";
			wave.spawnRemaining = 0;
			wave.spawnCooldown = 0;
			return;
		}

		if (wave.phase === "intermission") {
			wave.intermissionRemaining = math.max(0, wave.intermissionRemaining - dt);
			if (wave.intermissionRemaining <= 0) {
				wave.phase = "wave";
				wave.waveNumber += 1;
				wave.spawnRemaining = quotaForWave(wave.waveNumber);
				wave.spawnCooldown = 0;
			}
			return;
		}

		// phase === "wave"
		if (wave.spawnRemaining > 0) {
			wave.spawnCooldown = math.max(0, wave.spawnCooldown - dt);
		} else if (zombies.size() === 0) {
			wave.phase = "intermission";
			wave.intermissionRemaining = REGULAR_INTERMISSION_SECONDS;
		}
	}
}

@system({ schedule: Update, set: WaveSet, after: [AdvanceWaveState] })
class SpawnQueuedZombies {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		wave: ResMut<WaveState>,
		arena: Res<ArenaState>,
		ids: ResMut<WireIdAllocator>,
		stats: ResMut<SmokeStats>,
	) {
		if (wave.phase !== "wave") return;
		if (wave.spawnRemaining <= 0) return;
		if (wave.spawnCooldown > 0) {
			wave.spawnCooldown = math.max(0, wave.spawnCooldown - clock.fixedDelta);
			return;
		}

		const position = ringSpawnPosition(arena, wave.spawnIndex);
		wave.spawnIndex += 1;

		const hp = zombieHealth(wave.waveNumber);
		const speed = zombieSpeed(wave.waveNumber);

		commands.spawn(
			Zombie,
			new WireId(ids.allocate()),
			new Position(position),
			new Velocity(new Vector3()),
			new Health(hp, hp),
			new Radius(ZOMBIE_RADIUS),
			new MoveSpeed(speed),
			new Damage(ZOMBIE_CONTACT_DAMAGE),
			new ContactCooldown(0),
		);

		wave.spawnRemaining -= 1;
		wave.spawnCooldown = ZOMBIE_SPAWN_INTERVAL;
		stats.zombiesSpawned += 1;
	}
}

@system({ schedule: Update, set: MovementSet })
class StepZombieMovement {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		zombies: Query<[Entity, Position, MoveSpeed], With<Zombie>>,
		players: Query<[Entity, PlayerUnit, Position, Health]>,
	) {
		const dt = clock.fixedDelta;
		if (players.size() === 0) return;

		zombies.forEach((entity, pos, speed) => {
			const target = nearestPlayer(players, pos.value);
			if (target === undefined) return;
			const dir = horizontalDirection(pos.value, target.position);
			if (dir.Magnitude <= 1e-4) return;
			const nextPos = pos.value.add(dir.mul(speed.value * dt));
			commands.set(entity, Position, new Position(nextPos));
		});
	}
}

@system({ schedule: Update, set: MovementSet })
class StepProjectileMovement {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		projectiles: Query<[Entity, Position, Velocity, Lifetime], With<Projectile>>,
	) {
		const dt = clock.fixedDelta;
		projectiles.forEach((entity, pos, vel, life) => {
			const nextPos = pos.value.add(vel.value.mul(dt));
			commands.set(entity, Position, new Position(nextPos));
			commands.set(entity, Lifetime, new Lifetime(life.remaining - dt));
		});
	}
}

@observer({ event: FireWeaponIntent })
class SpawnProjectileFromIntent {
	run(
		event: FireWeaponIntent,
		commands: Commands,
		ids: ResMut<WireIdAllocator>,
		stats: ResMut<SmokeStats>,
		players: Query<[Entity, PlayerUnit, Position, Health, WeaponCooldown]>,
	) {
		let shooterEntity: Entity | undefined;
		let shooterPos: Vector3 | undefined;
		let shooterCooldown: WeaponCooldown | undefined;
		let shooterHealth: Health | undefined;
		players.forEach((entity, unit, pos, health, cooldown) => {
			if (unit.userId === event.shooterUserId) {
				shooterEntity = entity;
				shooterPos = pos.value;
				shooterCooldown = cooldown;
				shooterHealth = health;
			}
		});
		if (
			shooterEntity === undefined ||
			shooterPos === undefined ||
			shooterCooldown === undefined ||
			shooterHealth === undefined
		)
			return;
		if (shooterHealth.current <= 0) return;
		if (shooterCooldown.remaining > 0) return;

		// Clamp the client-supplied origin to a small radius around the player.
		const delta = event.origin.sub(shooterPos);
		const dist = delta.Magnitude;
		const clampedOrigin =
			dist <= SHOT_ORIGIN_CLAMP_RADIUS ? event.origin : shooterPos.add(delta.div(dist).mul(SHOT_ORIGIN_CLAMP_RADIUS));

		const dir = safeNormalize(event.direction);
		const velocity = dir.mul(PROJECTILE_SPEED);

		commands.spawn(
			new Projectile(event.shooterUserId),
			new WireId(ids.allocate()),
			new Position(clampedOrigin),
			new Velocity(velocity),
			new Lifetime(PROJECTILE_LIFETIME),
			new Radius(PROJECTILE_RADIUS),
			new Damage(PROJECTILE_DAMAGE),
		);

		commands.set(shooterEntity, WeaponCooldown, new WeaponCooldown(WEAPON_COOLDOWN));
		stats.shotsFired += 1;
	}
}

@system({ schedule: Update, set: CombatSet })
class TickCooldowns {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		players: Query<[Entity, WeaponCooldown], With<PlayerUnit>>,
		zombies: Query<[Entity, ContactCooldown], With<Zombie>>,
	) {
		const dt = clock.fixedDelta;
		players.forEach((entity, cooldown) => {
			if (cooldown.remaining > 0) {
				commands.set(entity, WeaponCooldown, new WeaponCooldown(math.max(0, cooldown.remaining - dt)));
			}
		});
		zombies.forEach((entity, cooldown) => {
			if (cooldown.remaining > 0) {
				commands.set(entity, ContactCooldown, new ContactCooldown(math.max(0, cooldown.remaining - dt)));
			}
		});
	}
}

@system({ schedule: Update, set: CombatSet, after: [TickCooldowns] })
class ResolveProjectileHits {
	run(
		commands: Commands,
		projectiles: Query<[Entity, Position, Radius, Damage], With<Projectile>>,
		zombies: Query<[Entity, Position, Radius, Health], With<Zombie>>,
	) {
		// Track which projectiles have already hit something this tick.
		const consumed = new Set<Entity>();
		projectiles.forEach((projEntity, projPos, projRadius, damage) => {
			if (consumed.has(projEntity)) return;
			let hitZombie: { entity: Entity; health: Health } | undefined;
			let bestDist = math.huge;
			zombies.forEach((zEntity, zPos, zRadius, zHealth) => {
				if (zHealth.current <= 0) return;
				const d = projPos.value.sub(zPos.value).Magnitude;
				const threshold = projRadius.value + zRadius.value;
				if (d <= threshold && d < bestDist) {
					bestDist = d;
					hitZombie = { entity: zEntity, health: zHealth };
				}
			});
			if (hitZombie !== undefined) {
				const nextHealth = math.max(0, hitZombie.health.current - damage.value);
				commands.set(hitZombie.entity, Health, new Health(nextHealth, hitZombie.health.max));
				commands.despawn(projEntity);
				consumed.add(projEntity);
			}
		});
	}
}

@system({ schedule: Update, set: CombatSet, after: [ResolveProjectileHits] })
class ResolveZombieContacts {
	run(
		commands: Commands,
		zombies: Query<[Entity, Position, Radius, Damage, ContactCooldown], With<Zombie>>,
		players: Query<[Entity, PlayerUnit, Position, Radius, Health]>,
	) {
		zombies.forEach((zEntity, zPos, zRadius, damage, cooldown) => {
			if (cooldown.remaining > 0) return;
			players.forEach((pEntity, _unit, pPos, pRadius, pHealth) => {
				if (pHealth.current <= 0) return;
				const d = zPos.value.sub(pPos.value).Magnitude;
				const threshold = zRadius.value + pRadius.value;
				if (d <= threshold) {
					const nextHealth = math.max(0, pHealth.current - damage.value);
					commands.set(pEntity, Health, new Health(nextHealth, pHealth.max));
					commands.set(zEntity, ContactCooldown, new ContactCooldown(ZOMBIE_CONTACT_COOLDOWN));
				}
			});
		});
	}
}

@system({ schedule: Update, set: CleanupSet })
class DespawnDeadZombies {
	run(
		commands: Commands,
		stats: ResMut<SmokeStats>,
		zombies: Query<[Entity, Health], With<Zombie>>,
	) {
		zombies.forEach((entity, health) => {
			if (health.current <= 0) {
				commands.despawn(entity);
				stats.zombiesKilled += 1;
			}
		});
	}
}

@system({ schedule: Update, set: CleanupSet })
class DespawnExpiredProjectiles {
	run(commands: Commands, projectiles: Query<[Entity, Lifetime], With<Projectile>>) {
		projectiles.forEach((entity, life) => {
			if (life.remaining <= 0) {
				commands.despawn(entity);
			}
		});
	}
}

@observer({ event: RestartIntent })
class HandleRestart {
	run(
		event: RestartIntent,
		commands: Commands,
		wave: ResMut<WaveState>,
		ids: ResMut<WireIdAllocator>,
		stats: ResMut<SmokeStats>,
		zombies: Query<[Entity], With<Zombie>>,
		projectiles: Query<[Entity], With<Projectile>>,
		players: Query<[Entity, PlayerUnit, WeaponCooldown]>,
	) {
		// Ignore the unused event field — keep the parameter typed for the observer.
		void event;
		if (wave.phase !== "defeat") return;
		zombies.forEach((entity) => commands.despawn(entity));
		projectiles.forEach((entity) => commands.despawn(entity));
		players.forEach((entity, _unit, _cooldown) => {
			commands.set(entity, Health, new Health(PLAYER_MAX_HEALTH, PLAYER_MAX_HEALTH));
			commands.set(entity, WeaponCooldown, new WeaponCooldown(0));
		});
		wave.phase = "intermission";
		wave.waveNumber = 0;
		wave.intermissionRemaining = INITIAL_INTERMISSION_SECONDS;
		wave.spawnRemaining = 0;
		wave.spawnCooldown = 0;
		wave.spawnIndex = 0;
		ids.reset();
		stats.restartApplied = true;
	}
}

@system({ schedule: Update, set: SnapshotSet })
class BuildSnapshot {
	run(
		clock: Res<ServerClock>,
		wave: Res<WaveState>,
		snap: ResMut<SnapshotState>,
		players: Query<[PlayerUnit, Position, Health]>,
		zombies: Query<[WireId, Position, Health], With<Zombie>>,
		projectiles: Query<[WireId, Position], With<Projectile>>,
	) {
		snap.sendAccumulator += clock.fixedDelta;
		if (snap.sendAccumulator < SNAPSHOT_INTERVAL) return;
		snap.sendAccumulator = 0;

		let playerHealth = 0;
		let playerMax = PLAYER_MAX_HEALTH;
		let playerPos = new Vector3();
		players.forEach((_unit, pos, health) => {
			playerHealth = health.current;
			playerMax = health.max;
			playerPos = pos.value;
		});

		const zombieSnaps: Array<ZombieSnapshot> = [];
		zombies.forEach((id, pos, health) => {
			zombieSnaps.push({
				id: id.value,
				position: pos.value,
				health: health.current,
				maxHealth: health.max,
			});
		});

		const projectileSnaps: Array<ProjectileSnapshot> = [];
		projectiles.forEach((id, pos) => {
			projectileSnaps.push({ id: id.value, position: pos.value });
		});

		const payload = new WorldSnapshotPayload(
			clock.tick,
			wave.phase,
			wave.waveNumber,
			wave.spawnRemaining + zombieSnaps.size(),
			playerHealth,
			playerMax,
			playerPos,
			zombieSnaps,
			projectileSnaps,
		);

		const serialized = worldSnapshotSerializer.serialize(payload);
		snap.latestBytes = serialized.buffer;
		snap.snapshotCount += 1;
	}
}

// ── External hooks (called by main.server.ts boot) ─────────────────────────

/**
 * Boot an `App` and wire all server gameplay. Returns the app so the
 * caller can drive the schedule and read snapshot bytes.
 */
export function boot(): App {
	const app = new App();
	app.configureSets(Update, [WaveSet, MovementSet, CombatSet, CleanupSet, SnapshotSet]);
	app.start();
	return app;
}

/** Ensure the player has a server entity with baseline components. */
export function registerPlayer(app: App, userId: number, player?: defined): Entity {
	const registry = app.world.resource(PlayerRegistry);
	const existing = registry.entitiesByUserId.get(userId);
	if (existing !== undefined) return existing;
	const entity = app.world.spawn(
		new PlayerUnit(userId),
		new Position(app.world.resource(ArenaState).center),
		new Velocity(new Vector3()),
		new Health(PLAYER_MAX_HEALTH, PLAYER_MAX_HEALTH),
		new Radius(PLAYER_RADIUS),
		new WeaponCooldown(0),
	);
	registry.entitiesByUserId.set(userId, entity);
	if (player !== undefined) registry.playersByUserId.set(userId, player);
	return entity;
}

export function unregisterPlayer(app: App, userId: number): void {
	const registry = app.world.resource(PlayerRegistry);
	const entity = registry.entitiesByUserId.get(userId);
	if (entity !== undefined) {
		app.world.despawn(entity);
		registry.entitiesByUserId.delete(userId);
	}
	registry.playersByUserId.delete(userId);
	registry.charactersByUserId.delete(userId);
}

export function attachCharacter(app: App, userId: number, character: defined): void {
	const registry = app.world.resource(PlayerRegistry);
	registry.charactersByUserId.set(userId, character);
}

export function detachCharacter(app: App, userId: number): void {
	const registry = app.world.resource(PlayerRegistry);
	registry.charactersByUserId.delete(userId);
}

/**
 * Pull the latest world position from each tracked player's character (if
 * any) and write it onto the corresponding Rovy entity. Called every fixed
 * step by the bootstrap, before `app.runSchedule(Update)`.
 */
export function syncPlayerPositions(
	app: App,
	resolvePosition: (userId: number, character: defined) => Vector3 | undefined,
): void {
	const registry = app.world.resource(PlayerRegistry);
	for (const [userId, character] of registry.charactersByUserId) {
		const entity = registry.entitiesByUserId.get(userId);
		if (entity === undefined) continue;
		const pos = resolvePosition(userId, character);
		if (pos !== undefined) {
			app.world.set(entity, Position, new Position(pos));
		}
	}
}

/** Set a player's position directly (test helper / synthetic boot). */
export function setPlayerPosition(app: App, userId: number, position: Vector3): void {
	const registry = app.world.resource(PlayerRegistry);
	const entity = registry.entitiesByUserId.get(userId);
	if (entity === undefined) return;
	app.world.set(entity, Position, new Position(position));
}

/** Translate a validated client request into a Rovy event. */
export function handleFireRequest(app: App, userId: number, request: FireWeaponRequestPayload): void {
	if (request.shooterUserId !== userId) return;
	const registry = app.world.resource(PlayerRegistry);
	if (!registry.entitiesByUserId.has(userId)) return;
	app.world.trigger(new FireWeaponIntent(userId, request.origin, request.direction));
}

export function handleRestartRequest(app: App, userId: number): void {
	app.world.trigger(new RestartIntent(userId));
}

/** Drive one fixed step. The bootstrap calls this from a heartbeat accumulator. */
export function stepFixed(app: App): void {
	app.runSchedule(Update);
}

/** Read & clear the latest snapshot bytes (or return undefined if unchanged). */
export function takeLatestSnapshotBytes(app: App): buffer | undefined {
	const snap = app.world.resource(SnapshotState);
	const bytes = snap.latestBytes;
	snap.latestBytes = undefined;
	return bytes;
}
