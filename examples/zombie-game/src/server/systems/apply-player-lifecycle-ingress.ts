import { Res, ResMut, World, system } from "@rovy/core";
import { PLAYER_MAX_HEALTH, PLAYER_RADIUS } from "shared/contracts";
import { Health, PlayerUnit, Position, Radius, Velocity, WeaponCooldown } from "../components";
import { PlayerLifecycleCollect } from "../collectors";
import { ArenaState, PlayerRegistry } from "../resources";
import { IngressSet, Update } from "../state";

@system({ schedule: Update, set: IngressSet })
export class ApplyPlayerLifecycleIngress {
	run(
		ingress: PlayerLifecycleCollect,
		world: World,
		registry: ResMut<PlayerRegistry>,
		arena: Res<ArenaState>,
	) {
		for (const event of ingress.drain()) {
			if (event.kind === "playerAdded") {
				if (registry.entitiesByUserId.has(event.userId)) continue;
				const entity = world.spawn(
					new PlayerUnit(event.userId),
					new Position(arena.center),
					new Velocity(new Vector3()),
					new Health(PLAYER_MAX_HEALTH, PLAYER_MAX_HEALTH),
					new Radius(PLAYER_RADIUS),
					new WeaponCooldown(0),
				);
				registry.entitiesByUserId.set(event.userId, entity);
			} else if (event.kind === "playerRemoving") {
				const entity = registry.entitiesByUserId.get(event.userId);
				if (entity !== undefined) {
					world.despawn(entity);
					registry.entitiesByUserId.delete(event.userId);
				}
				registry.charactersByUserId.delete(event.userId);
			} else if (event.kind === "characterAdded") {
				registry.charactersByUserId.set(event.userId, event.character);
			} else {
				registry.charactersByUserId.delete(event.userId);
			}
		}
	}
}
