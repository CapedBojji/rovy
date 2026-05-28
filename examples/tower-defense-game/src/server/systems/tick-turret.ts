import { Commands, Entity, Query, Res, ResMut, With, system } from "@rovy/core";
import {
	PROJECTILE_DAMAGE,
	PROJECTILE_LIFETIME,
	PROJECTILE_RADIUS,
	PROJECTILE_SPEED,
	TURRET_FIRE_COOLDOWN,
	TURRET_RANGE,
} from "shared/contracts";
import { Damage, Health, Lifetime, Monster, Position, Projectile, ProjectileTarget, Radius, ShotProfile, Velocity, WireId } from "../components";
import { ServerClock, TowerDefenseStats, TurretState, WireIdAllocator } from "../resources";
import { CombatSet, Update } from "../state";

@system({ schedule: Update, set: CombatSet })
export class TickTurret {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		turret: ResMut<TurretState>,
		ids: ResMut<WireIdAllocator>,
		stats: ResMut<TowerDefenseStats>,
		monsters: Query<[Entity, WireId, Position, Health, ShotProfile], With<Monster>>,
	) {
		turret.cooldown = math.max(0, turret.cooldown - clock.fixedDelta);
		if (turret.cooldown > 0) return;

		let target: { entity: Entity; id: number; position: Vector3; shot: ShotProfile; progress: number } | undefined;
		monsters.forEach((entity, wire, pos, health, shot) => {
			if (health.current <= 0) return;
			if (shot.shotTaken) return;
			const toMonster = pos.value.sub(turret.position);
			if (toMonster.Magnitude > TURRET_RANGE) return;
			if (target === undefined || pos.value.X > target.progress) {
				target = { entity, id: wire.value, position: pos.value, shot, progress: pos.value.X };
			}
		});
		if (target === undefined) return;

		const aimPosition = target.shot.willBeHit ? target.position : target.position.add(new Vector3(0, 0, 22));
		const direction = aimPosition.sub(turret.position);
		const magnitude = math.max(direction.Magnitude, 0.001);
		const velocity = direction.div(magnitude).mul(PROJECTILE_SPEED);
		commands.set(target.entity, ShotProfile, new ShotProfile(target.shot.spawnIndex, target.shot.willBeHit, true));
		commands.spawn(
			Projectile,
			new WireId(ids.allocate()),
			new Position(turret.position),
			new Velocity(velocity),
			new Radius(PROJECTILE_RADIUS),
			new Damage(target.shot.willBeHit ? PROJECTILE_DAMAGE : 0),
			new ProjectileTarget(target.id),
			new Lifetime(PROJECTILE_LIFETIME),
		);

		turret.cooldown = TURRET_FIRE_COOLDOWN;
		turret.lastTargetId = target.id;
		turret.lastShotTick = clock.tick;
		stats.shotsFired += 1;
	}
}
