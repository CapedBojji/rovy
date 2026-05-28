import { Commands, Entity, Query, Res, system, With } from "@rovy/core";
import { Lifetime, Position, Projectile, Velocity } from "../components";
import { ServerClock } from "../resources";
import { MovementSet, Update } from "../state";

@system({ schedule: Update, set: MovementSet })
export class StepMovement {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		moving: Query<[Entity, Position, Velocity]>,
		projectiles: Query<[Entity, Lifetime], With<Projectile>>,
	) {
		moving.forEach((entity, pos, velocity) => {
			commands.set(entity, Position, new Position(pos.value.add(velocity.value.mul(clock.fixedDelta))));
		});
		projectiles.forEach((entity, lifetime) => {
			const remaining = lifetime.remaining - clock.fixedDelta;
			if (remaining <= 0) {
				commands.despawn(entity);
			} else {
				commands.set(entity, Lifetime, new Lifetime(remaining));
			}
		});
	}
}
