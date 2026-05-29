import { Commands, Entity, EventReader, Query, Res, ResMut, With, system } from "@rovy/core";
import { NetEventContext } from "@rovy/networking";
import { FireWeaponRequestPayload } from "shared/contracts";
import {
	FireWeaponRequestNet,
	RestartRequestNet,
	TogglePauseRequestNet,
	fromFireWeaponRequestNet,
	fromTogglePauseRequestNet,
} from "shared/network";
import { Health, PlayerUnit, Position, Projectile, WeaponCooldown, Zombie } from "../components";
import { DevPauseState, PlayerRegistry, ScoreState, SmokeStats, WaveState, WireIdAllocator } from "../resources";
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
		pauseRequests: EventReader<TogglePauseRequestNet>,
		context: NetEventContext,
		commands: Commands,
		registry: Res<PlayerRegistry>,
		pause: ResMut<DevPauseState>,
		ids: ResMut<WireIdAllocator>,
		stats: ResMut<SmokeStats>,
		score: ResMut<ScoreState>,
		wave: ResMut<WaveState>,
		players: Query<[Entity, PlayerUnit, Position, Health, WeaponCooldown]>,
		restartPlayers: Query<[Entity, PlayerUnit, WeaponCooldown]>,
		zombies: Query<[Entity], With<Zombie>>,
		projectiles: Query<[Entity], With<Projectile>>,
	) {
		pauseRequests.forEach((event) => {
			const senderUserId = resolveSenderUserId(context, event, registry);
			if (senderUserId !== undefined && registry.entitiesByUserId.has(senderUserId)) {
				pause.paused = fromTogglePauseRequestNet(event).paused;
			}
		});

		fireRequests.forEach((event) => {
			if (pause.paused) return;
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
				applyRestart(commands, wave, ids, stats, score, zombies, projectiles, restartPlayers);
			}
		});
	}
}
