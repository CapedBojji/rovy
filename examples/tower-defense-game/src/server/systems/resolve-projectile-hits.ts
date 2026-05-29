import { Commands, Entity, Query, With, system } from "@rovy/core";
import { Damage, Health, Monster, Position, Projectile, ProjectileTarget, Radius, WireId } from "../components";
import { CombatSet, Update } from "../state";
import { TickTurret } from "./tick-turret";

@system({ schedule: Update, set: CombatSet, after: [TickTurret] })
export class ResolveProjectileHits {
	run(
		commands: Commands,
		projectiles: Query<[Entity, Position, Radius, Damage, ProjectileTarget], With<Projectile>>,
		monsters: Query<[Entity, WireId, Position, Radius, Health], With<Monster>>,
	) {
		const consumed = new Set<Entity>();
		projectiles.forEach((projectileEntity, projectilePos, projectileRadius, damage, target) => {
			if (consumed.has(projectileEntity)) return;
			if (damage.value <= 0) return;
			let hit: { entity: Entity; health: Health } | undefined;
			let bestDistance = math.huge;
			monsters.forEach((monsterEntity, wire, monsterPos, monsterRadius, health) => {
				if (wire.value !== target.wireId) return;
				if (health.current <= 0) return;
				const distance = projectilePos.value.sub(monsterPos.value).Magnitude;
				if (distance <= projectileRadius.value + monsterRadius.value && distance < bestDistance) {
					bestDistance = distance;
					hit = { entity: monsterEntity, health };
				}
			});
			if (hit === undefined) return;
			const nextHealth = math.max(0, hit.health.current - damage.value);
			commands.set(hit.entity, Health, new Health(nextHealth, hit.health.max));
			commands.despawn(projectileEntity);
			consumed.add(projectileEntity);
		});
	}
}
