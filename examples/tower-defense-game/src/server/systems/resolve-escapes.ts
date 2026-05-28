import { Commands, Entity, Query, system, With } from "@rovy/core";
import { BASE_LEAK_DAMAGE } from "shared/contracts";
import { Monster, Position, WireId } from "../components";
import { BaseDamaged } from "../events";
import { CleanupSet, PATH_END_X, Update } from "../state";

@system({ schedule: Update, set: CleanupSet })
export class ResolveEscapes {
	run(commands: Commands, monsters: Query<[Entity, WireId, Position], With<Monster>>) {
		monsters.forEach((entity, wire, pos) => {
			if (pos.value.X < PATH_END_X) return;
			commands.trigger(new BaseDamaged(wire.value, BASE_LEAK_DAMAGE, 0));
			commands.despawn(entity);
		});
	}
}
