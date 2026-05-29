import { Commands, Res, system } from "@rovy/core";
import { Position } from "../components";
import { PlayerRegistry } from "../resources";
import { IngressSet, Update, resolveCharacterPosition } from "../state";

@system({ schedule: Update, set: IngressSet })
export class SyncPlayerPositions {
	run(commands: Commands, registry: Res<PlayerRegistry>) {
		for (const [userId, character] of registry.charactersByUserId) {
			const entity = registry.entitiesByUserId.get(userId);
			if (entity === undefined) continue;
			const pos = resolveCharacterPosition(character);
			if (pos !== undefined) {
				commands.set(entity, Position, new Position(pos));
			}
		}
	}
}
