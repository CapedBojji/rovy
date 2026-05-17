import { Commands, Entity, Query, With } from "@rovy/core";
import {
	FireWeaponRequestPayload,
	INITIAL_INTERMISSION_SECONDS,
	PLAYER_MAX_HEALTH,
	PROJECTILE_DAMAGE,
	PROJECTILE_LIFETIME,
	PROJECTILE_RADIUS,
	PROJECTILE_SPEED,
	WEAPON_COOLDOWN,
} from "shared/contracts";
import {
	Damage,
	Health,
	Lifetime,
	PlayerUnit,
	Position,
	Projectile,
	Radius,
	Velocity,
	WeaponCooldown,
	WireId,
	Zombie,
} from "../components";
import {
	SmokeStats,
	WaveState,
	WireIdAllocator,
} from "../resources";
import { clampShotOrigin, safeNormalize } from "../state";

export function spawnProjectileFromRequest(
	request: FireWeaponRequestPayload,
	commands: Commands,
	ids: WireIdAllocator,
	stats: SmokeStats,
	players: Query<[Entity, PlayerUnit, Position, Health, WeaponCooldown]>,
): void {
	let shooterEntity: Entity | undefined;
	let shooterPos: Vector3 | undefined;
	let shooterCooldown: WeaponCooldown | undefined;
	let shooterHealth: Health | undefined;
	players.forEach((entity, unit, pos, health, cooldown) => {
		if (unit.userId === request.shooterUserId) {
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

	const clampedOrigin = clampShotOrigin(request.origin, shooterPos);
	const velocity = safeNormalize(request.direction).mul(PROJECTILE_SPEED);

	commands.spawn(
		new Projectile(request.shooterUserId),
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

export function applyRestart(
	commands: Commands,
	wave: WaveState,
	ids: WireIdAllocator,
	stats: SmokeStats,
	zombies: Query<[Entity], With<Zombie>>,
	projectiles: Query<[Entity], With<Projectile>>,
	players: Query<[Entity, PlayerUnit, WeaponCooldown]>,
): void {
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
