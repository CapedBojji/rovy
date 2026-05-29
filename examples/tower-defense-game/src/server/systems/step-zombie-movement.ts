import { Commands, Entity, Query, Res, ResMut, With, system } from "@rovy/core";
import { Damage, Health, MoveSpeed, PathProgress, PlayerUnit, Position, Zombie } from "../components";
import { DevPauseState, ServerClock, SmokeStats } from "../resources";
import { MovementSet, pathPosition, PATH_END_X, Update } from "../state";

@system({ schedule: Update, set: MovementSet })
export class StepZombieMovement {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		pause: Res<DevPauseState>,
		stats: ResMut<SmokeStats>,
		zombies: Query<[Entity, Position, MoveSpeed, PathProgress, Damage], With<Zombie>>,
		players: Query<[Entity, PlayerUnit, Health]>,
	) {
		if (pause.paused) return;
		const dt = clock.fixedDelta;

		zombies.forEach((entity, _pos, speed, progress, damage) => {
			const nextProgress = progress.value + (speed.value * dt) / math.abs(PATH_END_X - pathPosition(0).X);
			if (nextProgress >= 1) {
				players.forEach((playerEntity, _unit, health) => {
					if (health.current <= 0) return;
					commands.set(
						playerEntity,
						Health,
						new Health(math.max(0, health.current - damage.value), health.max),
					);
				});
				stats.zombiesEscaped += 1;
				commands.despawn(entity);
				return;
			}
			commands.set(entity, PathProgress, new PathProgress(nextProgress));
			commands.set(entity, Position, new Position(pathPosition(nextProgress)));
		});
	}
}
