import { EventReader, Res, ResMut, World, system } from "@rovy/core";
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

@system({ schedule: Render, set: SnapshotSet })
export class ApplySnapshotIngress {
	run(
		ingress: EventReader<WorldSnapshotNet>,
		clock: Res<ClientClock>,
		world: World,
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

			const liveZombies = new Set<number>();
			for (const z of snap.zombies) {
				liveZombies.add(z.id);
				const existing = nem.zombies.get(z.id);
				if (existing === undefined) {
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
					world.set(
						existing,
						PreviousPosition,
						new PreviousPosition(prev !== undefined ? prev.value : z.position, clock.now),
					);
					world.set(existing, ClientPosition, new ClientPosition(z.position));
				}
			}
			for (const [id, entity] of nem.zombies) {
				if (!liveZombies.has(id)) {
					world.despawn(entity);
					nem.zombies.delete(id);
				}
			}

			const liveProjectiles = new Set<number>();
			for (const p of snap.projectiles) {
				liveProjectiles.add(p.id);
				const existing = nem.projectiles.get(p.id);
				if (existing === undefined) {
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
					world.set(
						existing,
						PreviousPosition,
						new PreviousPosition(prev !== undefined ? prev.value : p.position, clock.now),
					);
					world.set(existing, ClientPosition, new ClientPosition(p.position));
				}
			}
			for (const [id, entity] of nem.projectiles) {
				if (!liveProjectiles.has(id)) {
					world.despawn(entity);
					nem.projectiles.delete(id);
				}
			}
		});
	}
}
