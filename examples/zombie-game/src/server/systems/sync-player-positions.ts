import { Res, World, system } from "@rovy/core";
import { Position } from "../components";
import { PlayerRegistry } from "../resources";
import { IngressSet, Update, resolveCharacterPosition } from "../state";

@system({ schedule: Update, set: IngressSet })
export class SyncPlayerPositions {
	run(world: World, registry: Res<PlayerRegistry>) {
		for (const [userId, character] of registry.charactersByUserId) {
			const entity = registry.entitiesByUserId.get(userId);
			if (entity === undefined) continue;
			const pos = resolveCharacterPosition(character);
			if (pos !== undefined) {
				world.set(entity, Position, new Position(pos));
			}
		}
	}
}
