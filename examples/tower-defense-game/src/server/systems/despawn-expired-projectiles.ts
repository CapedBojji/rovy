import { Commands, Entity, Query, Res, With, system } from "@rovy/core";
import { Lifetime, Projectile } from "../components";
import { DevPauseState } from "../resources";
import { CleanupSet, Update } from "../state";

@system({ schedule: Update, set: CleanupSet })
export class DespawnExpiredProjectiles {
	run(commands: Commands, pause: Res<DevPauseState>, projectiles: Query<[Entity, Lifetime], With<Projectile>>) {
		if (pause.paused) return;
		projectiles.forEach((entity, life) => {
			if (life.remaining <= 0) {
				commands.despawn(entity);
			}
		});
	}
}
