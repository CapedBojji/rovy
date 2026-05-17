import { Query, Res, ResMut, With, system } from "@rovy/core";
import { NetServer } from "@rovy/networking";
import { PLAYER_MAX_HEALTH, WorldSnapshotPayload } from "shared/contracts";
import { toWorldSnapshotNet } from "shared/network";
import { Health, PlayerUnit, Position, Projectile, WireId, Zombie } from "../components";
import { ServerClock, SnapshotState, WaveState } from "../resources";
import { SnapshotSet, tickSnapshotAccumulator, Update } from "../state";

@system({ schedule: Update, set: SnapshotSet })
export class BuildSnapshot {
	run(
		clock: Res<ServerClock>,
		wave: Res<WaveState>,
		snap: ResMut<SnapshotState>,
		network: NetServer,
		players: Query<[PlayerUnit, Position, Health]>,
		zombies: Query<[WireId, Position, Health], With<Zombie>>,
		projectiles: Query<[WireId, Position], With<Projectile>>,
	) {
		if (!tickSnapshotAccumulator(clock, snap)) return;

		let playerHealth = 0;
		let playerMax = PLAYER_MAX_HEALTH;
		let playerPos = new Vector3();
		players.forEach((_unit, pos, health) => {
			playerHealth = health.current;
			playerMax = health.max;
			playerPos = pos.value;
		});

		const zombieSnaps = new Array<{ id: number; position: Vector3; health: number; maxHealth: number }>();
		zombies.forEach((id, pos, health) => {
			zombieSnaps.push({
				id: id.value,
				position: pos.value,
				health: health.current,
				maxHealth: health.max,
			});
		});

		const projectileSnaps = new Array<{ id: number; position: Vector3 }>();
		projectiles.forEach((id, pos) => {
			projectileSnaps.push({ id: id.value, position: pos.value });
		});

		const payload = new WorldSnapshotPayload(
			clock.tick,
			wave.phase,
			wave.waveNumber,
			wave.spawnRemaining + zombieSnaps.size(),
			playerHealth,
			playerMax,
			playerPos,
			zombieSnaps,
			projectileSnaps,
		);

		snap.snapshotCount += 1;
		network.broadcast(toWorldSnapshotNet(payload));
	}
}
