import { Commands, Entity, Query, Res, ResMut, With, system } from "@rovy/core";
import {
	PROJECTILE_DAMAGE,
	PROJECTILE_LIFETIME,
	PROJECTILE_RADIUS,
	PROJECTILE_SPEED,
	TOWER_FIRE_COOLDOWN,
	TOWER_RANGE,
} from "shared/contracts";
import { Damage, Health, Lifetime, PlayerUnit, Position, Projectile, Radius, Velocity, WireId, Zombie } from "../components";
import { DevPauseState, ServerClock, SmokeStats, TurretState, WireIdAllocator } from "../resources";
import { CombatSet, safeNormalize, towerPosition, Update } from "../state";
import { TickCooldowns } from "./tick-cooldowns";

@system({ schedule: Update, set: CombatSet, after: [TickCooldowns] })
export class FireTower {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		pause: Res<DevPauseState>,
		turret: ResMut<TurretState>,
		ids: ResMut<WireIdAllocator>,
		stats: ResMut<SmokeStats>,
		players: Query<[PlayerUnit, Health]>,
		zombies: Query<[Entity, Position, Health], With<Zombie>>,
	) {
		if (pause.paused) return;

		let baseAlive = players.size() === 0;
		players.forEach((_unit, health) => {
			if (health.current > 0) baseAlive = true;
		});
		if (!baseAlive) return;

		turret.fireCooldown = math.max(0, turret.fireCooldown - clock.fixedDelta);
		if (turret.fireCooldown > 0) return;

		const origin = towerPosition();
		let target: Vector3 | undefined;
		let bestDistance = math.huge;
		zombies.forEach((_entity, pos, health) => {
			if (health.current <= 0) return;
			const distance = pos.value.sub(origin).Magnitude;
			if (distance <= TOWER_RANGE && distance < bestDistance) {
				bestDistance = distance;
				target = pos.value;
			}
		});
		if (target === undefined) return;

		const direction = safeNormalize(target.sub(origin));
		commands.spawn(
			new Projectile(0),
			new WireId(ids.allocate()),
			new Position(origin),
			new Velocity(direction.mul(PROJECTILE_SPEED)),
			new Lifetime(PROJECTILE_LIFETIME),
			new Radius(PROJECTILE_RADIUS),
			new Damage(PROJECTILE_DAMAGE),
		);
		turret.fireCooldown = TOWER_FIRE_COOLDOWN;
		stats.shotsFired += 1;
	}
}
