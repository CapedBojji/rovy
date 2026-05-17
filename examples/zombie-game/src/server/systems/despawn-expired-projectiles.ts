import { Commands, Entity, Query, With, system } from "@rovy/core";
import { Lifetime, Projectile } from "../components";
import { CleanupSet, Update } from "../state";

@system({ schedule: Update, set: CleanupSet })
export class DespawnExpiredProjectiles {
	run(commands: Commands, projectiles: Query<[Entity, Lifetime], With<Projectile>>) {
		projectiles.forEach((entity, life) => {
			if (life.remaining <= 0) {
				commands.despawn(entity);
			}
		});
	}
}
