import { Commands, Entity, Query, Res, With, system } from "@rovy/core";
import { Lifetime, Position, Projectile, Velocity } from "../components";
import { ServerClock } from "../resources";
import { MovementSet, Update } from "../state";

@system({ schedule: Update, set: MovementSet })
export class StepProjectileMovement {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		projectiles: Query<[Entity, Position, Velocity, Lifetime], With<Projectile>>,
	) {
		const dt = clock.fixedDelta;
		projectiles.forEach((entity, pos, vel, life) => {
			commands.set(entity, Position, new Position(pos.value.add(vel.value.mul(dt))));
			commands.set(entity, Lifetime, new Lifetime(life.remaining - dt));
		});
	}
}
