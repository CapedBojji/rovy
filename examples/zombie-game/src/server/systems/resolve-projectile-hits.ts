import { Commands, Entity, Query, With, system } from "@rovy/core";
import { Damage, Health, Position, Projectile, Radius, Zombie } from "../components";
import { CombatSet, Update } from "../state";
import { TickCooldowns } from "./tick-cooldowns";

@system({ schedule: Update, set: CombatSet, after: [TickCooldowns] })
export class ResolveProjectileHits {
	run(
		commands: Commands,
		projectiles: Query<[Entity, Position, Radius, Damage], With<Projectile>>,
		zombies: Query<[Entity, Position, Radius, Health], With<Zombie>>,
	) {
		const consumed = new Set<Entity>();
		projectiles.forEach((projEntity, projPos, projRadius, damage) => {
			if (consumed.has(projEntity)) return;
			let hitZombie: { entity: Entity; health: Health } | undefined;
			let bestDist = math.huge;
			zombies.forEach((zEntity, zPos, zRadius, zHealth) => {
				if (zHealth.current <= 0) return;
				const d = projPos.value.sub(zPos.value).Magnitude;
				if (d <= projRadius.value + zRadius.value && d < bestDist) {
					bestDist = d;
					hitZombie = { entity: zEntity, health: zHealth };
				}
			});
			if (hitZombie === undefined) return;
			const nextHealth = math.max(0, hitZombie.health.current - damage.value);
			commands.set(hitZombie.entity, Health, new Health(nextHealth, hitZombie.health.max));
			commands.despawn(projEntity);
			consumed.add(projEntity);
		});
	}
}
