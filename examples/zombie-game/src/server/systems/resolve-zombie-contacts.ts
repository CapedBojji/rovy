import { Commands, Entity, Query, With, system } from "@rovy/core";
import { ContactCooldown, Damage, Health, PlayerUnit, Position, Radius, Zombie } from "../components";
import { CombatSet, Update } from "../state";
import { ZOMBIE_CONTACT_COOLDOWN } from "shared/contracts";
import { ResolveProjectileHits } from "./resolve-projectile-hits";

@system({ schedule: Update, set: CombatSet, after: [ResolveProjectileHits] })
export class ResolveZombieContacts {
	run(
		commands: Commands,
		zombies: Query<[Entity, Position, Radius, Damage, ContactCooldown], With<Zombie>>,
		players: Query<[Entity, PlayerUnit, Position, Radius, Health]>,
	) {
		zombies.forEach((zEntity, zPos, zRadius, damage, cooldown) => {
			if (cooldown.remaining > 0) return;
			players.forEach((pEntity, _unit, pPos, pRadius, pHealth) => {
				if (pHealth.current <= 0) return;
				if (zPos.value.sub(pPos.value).Magnitude > zRadius.value + pRadius.value) return;
				const nextHealth = math.max(0, pHealth.current - damage.value);
				commands.set(pEntity, Health, new Health(nextHealth, pHealth.max));
				commands.set(zEntity, ContactCooldown, new ContactCooldown(ZOMBIE_CONTACT_COOLDOWN));
			});
		});
	}
}
