import { Commands, Entity, Query, Res, With, system } from "@rovy/core";
import { Lifetime, Position, Projectile, Velocity } from "../components";
import { DevPauseState, ServerClock } from "../resources";
import { MovementSet, Update } from "../state";

@system({ schedule: Update, set: MovementSet })
export class StepProjectileMovement {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		pause: Res<DevPauseState>,
		projectiles: Query<[Entity, Position, Velocity, Lifetime], With<Projectile>>,
	) {
		if (pause.paused) return;
		const dt = clock.fixedDelta;
		projectiles.forEach((entity, pos, vel, life) => {
			commands.set(entity, Position, new Position(pos.value.add(vel.value.mul(dt))));
			commands.set(entity, Lifetime, new Lifetime(life.remaining - dt));
		});
	}
}
