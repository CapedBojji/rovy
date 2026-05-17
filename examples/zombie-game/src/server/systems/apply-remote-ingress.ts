import { Commands, Entity, Query, Res, ResMut, With, system } from "@rovy/core";
import { Health, PlayerUnit, Position, Projectile, WeaponCooldown, Zombie } from "../components";
import { RemoteIngressCollect } from "../collectors";
import { PlayerRegistry, SmokeStats, WaveState, WireIdAllocator } from "../resources";
import { IngressSet, Update } from "../state";
import { applyRestart, spawnProjectileFromRequest } from "./shared";

@system({ schedule: Update, set: IngressSet })
export class ApplyRemoteIngress {
	run(
		ingress: RemoteIngressCollect,
		commands: Commands,
		registry: Res<PlayerRegistry>,
		ids: ResMut<WireIdAllocator>,
		stats: ResMut<SmokeStats>,
		wave: ResMut<WaveState>,
		players: Query<[Entity, PlayerUnit, Position, Health, WeaponCooldown]>,
		restartPlayers: Query<[Entity, PlayerUnit, WeaponCooldown]>,
		zombies: Query<[Entity], With<Zombie>>,
		projectiles: Query<[Entity], With<Projectile>>,
	) {
		for (const event of ingress.drain()) {
			if (event.kind === "fire") {
				if (event.request.shooterUserId !== event.userId) continue;
				if (!registry.entitiesByUserId.has(event.userId)) continue;
				spawnProjectileFromRequest(event.request, commands, ids, stats, players);
			} else if (registry.entitiesByUserId.has(event.userId)) {
				applyRestart(commands, wave, ids, stats, zombies, projectiles, restartPlayers);
			}
		}
	}
}
