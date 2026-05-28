import { Commands, Entity, Query, ResMut, With, system } from "@rovy/core";
import { Health, Monster } from "../components";
import { TowerDefenseStats } from "../resources";
import { CleanupSet, Update } from "../state";

@system({ schedule: Update, set: CleanupSet })
export class DespawnDeadMonsters {
	run(commands: Commands, stats: ResMut<TowerDefenseStats>, monsters: Query<[Entity, Health], With<Monster>>) {
		monsters.forEach((entity, health) => {
			if (health.current > 0) return;
			commands.despawn(entity);
			stats.monstersKilled += 1;
		});
	}
}
