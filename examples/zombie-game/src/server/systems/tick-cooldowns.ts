import { Commands, Entity, Query, Res, With, system } from "@rovy/core";
import { ContactCooldown, PlayerUnit, WeaponCooldown, Zombie } from "../components";
import { ServerClock } from "../resources";
import { CombatSet, Update } from "../state";

@system({ schedule: Update, set: CombatSet })
export class TickCooldowns {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		players: Query<[Entity, WeaponCooldown], With<PlayerUnit>>,
		zombies: Query<[Entity, ContactCooldown], With<Zombie>>,
	) {
		const dt = clock.fixedDelta;
		players.forEach((entity, cooldown) => {
			if (cooldown.remaining > 0) {
				commands.set(entity, WeaponCooldown, new WeaponCooldown(math.max(0, cooldown.remaining - dt)));
			}
		});
		zombies.forEach((entity, cooldown) => {
			if (cooldown.remaining > 0) {
				commands.set(entity, ContactCooldown, new ContactCooldown(math.max(0, cooldown.remaining - dt)));
			}
		});
	}
}
