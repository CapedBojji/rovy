import { Commands, Entity, EventReader, Query, Res, ResMut, With, system } from "@rovy/core";
import { NetEventContext } from "@rovy/networking";
import { FireWeaponRequestPayload } from "shared/contracts";
import {
	FireWeaponRequestNet,
	RestartRequestNet,
	fromFireWeaponRequestNet,
} from "shared/network";
import { Health, PlayerUnit, Position, Projectile, WeaponCooldown, Zombie } from "../components";
import { PlayerRegistry, SmokeStats, WaveState, WireIdAllocator } from "../resources";
import { RemoteIngressSet, Update } from "../state";
import { applyRestart, spawnProjectileFromRequest } from "./shared";

function resolveSenderUserId(context: NetEventContext, event: object, registry: PlayerRegistry): number | undefined {
	const sender = context.senderOf(event);
	if (sender !== undefined) return sender.UserId;
	for (const [userId] of registry.entitiesByUserId) return userId;
	return undefined;
}

@system({ schedule: Update, set: RemoteIngressSet })
export class ApplyRemoteIngress {
	run(
		fireRequests: EventReader<FireWeaponRequestNet>,
		restartRequests: EventReader<RestartRequestNet>,
		context: NetEventContext,
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
		fireRequests.forEach((event) => {
			const request = fromFireWeaponRequestNet(event) as FireWeaponRequestPayload;
			const senderUserId = resolveSenderUserId(context, event, registry);
			if (senderUserId === undefined) return;
			if (request.shooterUserId !== senderUserId) return;
			if (!registry.entitiesByUserId.has(senderUserId)) return;
			spawnProjectileFromRequest(request, commands, ids, stats, players);
		});

		restartRequests.forEach((event) => {
			const senderUserId = resolveSenderUserId(context, event, registry);
			if (senderUserId !== undefined && registry.entitiesByUserId.has(senderUserId)) {
				applyRestart(commands, wave, ids, stats, zombies, projectiles, restartPlayers);
			}
		});
	}
}
