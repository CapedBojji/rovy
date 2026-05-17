import { Commands, Entity, Query, Res, With, system } from "@rovy/core";
import { Health, MoveSpeed, PlayerUnit, Position, Zombie } from "../components";
import { ServerClock } from "../resources";
import { horizontalDirection, MovementSet, nearestPlayer, Update } from "../state";

@system({ schedule: Update, set: MovementSet })
export class StepZombieMovement {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		zombies: Query<[Entity, Position, MoveSpeed], With<Zombie>>,
		players: Query<[Entity, PlayerUnit, Position, Health]>,
	) {
		const dt = clock.fixedDelta;
		if (players.size() === 0) return;

		zombies.forEach((entity, pos, speed) => {
			const target = nearestPlayer(players, pos.value);
			if (target === undefined) return;
			const dir = horizontalDirection(pos.value, target.position);
			if (dir.Magnitude <= 1e-4) return;
			commands.set(entity, Position, new Position(pos.value.add(dir.mul(speed.value * dt))));
		});
	}
}
