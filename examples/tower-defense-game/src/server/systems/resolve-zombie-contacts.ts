import { Commands, Entity, Query, Res, ResMut, With, system } from "@rovy/core";
import { ContactCooldown, Damage, Health, PlayerUnit, Position, Radius, Zombie } from "../components";
import { DevPauseState, ScoreState } from "../resources";
import { CombatSet, Update } from "../state";
import { ZOMBIE_CONTACT_COOLDOWN } from "shared/contracts";
import { ResolveProjectileHits } from "./resolve-projectile-hits";

@system({ schedule: Update, set: CombatSet, after: [ResolveProjectileHits] })
export class ResolveZombieContacts {
	run(
		commands: Commands,
		pause: Res<DevPauseState>,
		score: ResMut<ScoreState>,
		zombies: Query<[Entity, Position, Radius, Damage, ContactCooldown], With<Zombie>>,
		players: Query<[Entity, PlayerUnit, Position, Radius, Health]>,
	) {
		if (pause.paused) return;
		zombies.forEach((zEntity, zPos, zRadius, damage, cooldown) => {
			if (cooldown.remaining > 0) return;
			players.forEach((pEntity, _unit, pPos, pRadius, pHealth) => {
				if (pHealth.current <= 0) return;
				if (zPos.value.sub(pPos.value).Magnitude > zRadius.value + pRadius.value) return;
				const nextHealth = math.max(0, pHealth.current - damage.value);
				if (nextHealth < pHealth.current) score.combo = 0;
				commands.set(pEntity, Health, new Health(nextHealth, pHealth.max));
				commands.set(zEntity, ContactCooldown, new ContactCooldown(ZOMBIE_CONTACT_COOLDOWN));
			});
		});
	}
}
