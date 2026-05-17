import { Commands, Entity, Query, ResMut, With, system } from "@rovy/core";
import { Health, Zombie } from "../components";
import { SmokeStats } from "../resources";
import { CleanupSet, Update } from "../state";

@system({ schedule: Update, set: CleanupSet })
export class DespawnDeadZombies {
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
