import { Commands, Entity, Query, Res, ResMut, With, system } from "@rovy/core";
import { Health, Zombie } from "../components";
import { DevPauseState, SmokeStats } from "../resources";
import { CleanupSet, Update } from "../state";

@system({ schedule: Update, set: CleanupSet })
export class DespawnDeadZombies {
	run(
		commands: Commands,
		pause: Res<DevPauseState>,
		stats: ResMut<SmokeStats>,
		zombies: Query<[Entity, Health], With<Zombie>>,
	) {
		if (pause.paused) return;
		zombies.forEach((entity, health) => {
			if (health.current <= 0) {
				commands.despawn(entity);
				stats.zombiesKilled += 1;
			}
		});
	}
}
