import { Commands, Entity, EventReader, Res, ResMut, World, system } from "@rovy/core";
import { WorldSnapshotPayload } from "shared/contracts";
import { WorldSnapshotNet, fromWorldSnapshotNet } from "shared/network";
import { ClientClock, HudState, NetworkEntityMap } from "../resources";
import {
	Render,
	SnapshotSet,
	ZOMBIE_SIZE,
	ZOMBIE_COLOR,
	ZOMBIE_MATERIAL,
	ZOMBIE_Y_OFFSET,
	PROJECTILE_SIZE,
	PROJECTILE_COLOR,
	PROJECTILE_MATERIAL,
	PROJECTILE_Y_OFFSET,
} from "../state";
import {
	ClientPosition,
	ClientProjectile,
	ClientZombie,
	ModelData,
	NetworkId,
	PreviousPosition,
} from "../components";

function hasLiveEntity(world: World, entity: number | undefined, marker: typeof ClientZombie | typeof ClientProjectile): entity is number {
	return entity !== undefined && world.has(entity as Entity, marker);
}

@system({ schedule: Render, set: SnapshotSet })
export class ApplySnapshotIngress {
	run(
		ingress: EventReader<WorldSnapshotNet>,
		clock: Res<ClientClock>,
		world: World,
		commands: Commands,
		nem: ResMut<NetworkEntityMap>,
		hud: ResMut<HudState>,
	) {
		ingress.forEach((event) => {
			const snap = fromWorldSnapshotNet(event) as WorldSnapshotPayload;

			hud.phase = snap.phase;
			hud.waveNumber = snap.waveNumber;
			hud.enemiesRemaining = snap.enemiesRemaining;
			hud.playerHealth = snap.playerHealth;
			hud.playerMaxHealth = snap.playerMaxHealth;
			hud.gameOver = snap.phase === "defeat";
			hud.paused = snap.paused;

			const liveZombies = new Set<number>();
			for (const z of snap.zombies) {
				liveZombies.add(z.id);
				const existing = nem.zombies.get(z.id);
				if (!hasLiveEntity(world, existing, ClientZombie)) {
					if (existing !== undefined) nem.zombies.delete(z.id);
					const entity = world.spawn(
						new ClientZombie(),
						new NetworkId(z.id),
						new ClientPosition(z.position),
						new PreviousPosition(z.position, clock.now),
						new ModelData(ZOMBIE_SIZE, ZOMBIE_COLOR, ZOMBIE_MATERIAL, ZOMBIE_Y_OFFSET),
					);
					nem.zombies.set(z.id, entity);
				} else {
					const prev = world.get(existing, ClientPosition);
					commands.set(
						existing,
						PreviousPosition,
						new PreviousPosition(prev !== undefined ? prev.value : z.position, clock.now),
					);
					commands.set(existing, ClientPosition, new ClientPosition(z.position));
				}
			}
			for (const [id, entity] of nem.zombies) {
				if (!liveZombies.has(id)) {
					commands.despawn(entity);
					nem.zombies.delete(id);
				}
			}

			const liveProjectiles = new Set<number>();
			for (const p of snap.projectiles) {
				liveProjectiles.add(p.id);
				const existing = nem.projectiles.get(p.id);
				if (!hasLiveEntity(world, existing, ClientProjectile)) {
					if (existing !== undefined) nem.projectiles.delete(p.id);
					const entity = world.spawn(
						new ClientProjectile(),
						new NetworkId(p.id),
						new ClientPosition(p.position),
						new PreviousPosition(p.position, clock.now),
						new ModelData(PROJECTILE_SIZE, PROJECTILE_COLOR, PROJECTILE_MATERIAL, PROJECTILE_Y_OFFSET),
					);
					nem.projectiles.set(p.id, entity);
				} else {
					const prev = world.get(existing, ClientPosition);
					commands.set(
						existing,
						PreviousPosition,
						new PreviousPosition(prev !== undefined ? prev.value : p.position, clock.now),
					);
					commands.set(existing, ClientPosition, new ClientPosition(p.position));
				}
			}
			for (const [id, entity] of nem.projectiles) {
				if (!liveProjectiles.has(id)) {
					commands.despawn(entity);
					nem.projectiles.delete(id);
				}
			}
		});
	}
}
