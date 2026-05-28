import { Query, Res, ResMut, With, system } from "@rovy/core";
import { NetServer } from "@rovy/networking";
import { TowerSnapshotPayload } from "shared/contracts";
import { toTowerSnapshotNet } from "shared/network";
import { Health, Monster, Position, Projectile, ShotProfile, WireId } from "../components";
import { ClientSignalState, ServerClock, SnapshotState, TowerDefenseStats } from "../resources";
import { pathProgress, SnapshotSet, tickSnapshotAccumulator, Update } from "../state";

@system({ schedule: Update, set: SnapshotSet })
export class BuildSnapshot {
	run(
		clock: Res<ServerClock>,
		stats: Res<TowerDefenseStats>,
		client: Res<ClientSignalState>,
		snap: ResMut<SnapshotState>,
		network: NetServer,
		monsters: Query<[WireId, Position, Health, ShotProfile], With<Monster>>,
		projectiles: Query<[WireId, Position], With<Projectile>>,
	) {
		if (!tickSnapshotAccumulator(clock, snap)) return;

		const monsterSnaps = new Array<{
			id: number;
			position: Vector3;
			health: number;
			maxHealth: number;
			progress: number;
			spawnIndex: number;
			willBeHit: boolean;
			shotTaken: boolean;
		}>();
		monsters.forEach((id, pos, health, shot) => {
			monsterSnaps.push({
				id: id.value,
				position: pos.value,
				health: health.current,
				maxHealth: health.max,
				progress: pathProgress(pos.value.X),
				spawnIndex: shot.spawnIndex,
				willBeHit: shot.willBeHit,
				shotTaken: shot.shotTaken,
			});
		});

		const projectileSnaps = new Array<{ id: number; position: Vector3 }>();
		projectiles.forEach((id, pos) => {
			projectileSnaps.push({ id: id.value, position: pos.value });
		});

		const payload = new TowerSnapshotPayload(
			clock.tick,
			clock.simTime,
			"running",
			stats.monstersSpawned,
			stats.monstersKilled,
			stats.monstersEscaped,
			stats.damageEvents,
			stats.totalLeakDamage,
			stats.shotsFired,
			monsterSnaps.size(),
			projectileSnaps.size(),
			stats.lastDamageTick,
			stats.lastDamageAmount,
			client.lastClientFrame,
			monsterSnaps,
			projectileSnaps,
		);

		snap.snapshotCount += 1;
		network.broadcast(toTowerSnapshotNet(payload));
	}
}
