import { Commands, Entity, EventReader, Res, ResMut, World, system } from "@rovy/core";
import { fromTowerSnapshotNet, TowerSnapshotNet } from "shared/network";
import {
	ClientMonster,
	ClientPosition,
	ClientProjectile,
	ClientTurret,
	ModelData,
	NetworkId,
	PreviousPosition,
} from "../components";
import { ClientClock, ClientPlaybackState, HudState, NetworkEntityMap } from "../resources";
import {
	MONSTER_HIT_COLOR,
	MONSTER_MATERIAL,
	MONSTER_MISS_COLOR,
	MONSTER_SIZE,
	MONSTER_Y_OFFSET,
	ModelSet,
	PROJECTILE_COLOR,
	PROJECTILE_MATERIAL,
	PROJECTILE_SIZE,
	PROJECTILE_Y_OFFSET,
	Render,
	TURRET_COLOR,
	TURRET_MATERIAL,
	TURRET_RENDER_POSITION,
	TURRET_SIZE,
	TURRET_Y_OFFSET,
} from "../state";

function hasLiveEntity(world: World, entity: number | undefined, marker: typeof ClientMonster | typeof ClientProjectile): entity is number {
	return entity !== undefined && world.has(entity as Entity, marker);
}

@system({ schedule: Render, set: ModelSet })
export class ApplySnapshotIngress {
	run(
		ingress: EventReader<TowerSnapshotNet>,
		clock: Res<ClientClock>,
		world: World,
		commands: Commands,
		nem: ResMut<NetworkEntityMap>,
		playback: ResMut<ClientPlaybackState>,
		hud: ResMut<HudState>,
	) {
		if (nem.turret === undefined || !world.has(nem.turret, ClientTurret)) {
			const turret = world.spawn(
				new ClientTurret(),
				new NetworkId(0),
				new ClientPosition(TURRET_RENDER_POSITION),
				new ModelData("Turret", TURRET_SIZE, TURRET_COLOR, TURRET_MATERIAL, TURRET_Y_OFFSET),
			);
			nem.turret = turret;
		}

		ingress.forEach((event) => {
			const snap = fromTowerSnapshotNet(event);
			playback.lastSnapshotTick = snap.serverTick;
			playback.snapshotsReceived += 1;
			playback.lastDamageEvents = snap.damageEvents;

			hud.serverTick = snap.serverTick;
			hud.simTime = snap.simTime;
			hud.monstersSpawned = snap.monstersSpawned;
			hud.monstersKilled = snap.monstersKilled;
			hud.monstersEscaped = snap.monstersEscaped;
			hud.damageEvents = snap.damageEvents;
			hud.totalLeakDamage = snap.totalLeakDamage;
			hud.shotsFired = snap.shotsFired;
			hud.activeMonsters = snap.activeMonsters;
			hud.activeProjectiles = snap.activeProjectiles;
			hud.lastDamageAmount = snap.lastDamageAmount;
			hud.lastClientFrameSeenByServer = snap.lastClientFrame;

			const liveMonsters = new Set<number>();
			for (const monster of snap.monsters) {
				liveMonsters.add(monster.id);
				const monsterColor = monster.willBeHit ? MONSTER_HIT_COLOR : MONSTER_MISS_COLOR;
				const existing = nem.monsters.get(monster.id);
				if (!hasLiveEntity(world, existing, ClientMonster)) {
					if (existing !== undefined) nem.monsters.delete(monster.id);
					const entity = world.spawn(
						new ClientMonster(),
						new NetworkId(monster.id),
						new ClientPosition(monster.position),
						new PreviousPosition(monster.position, clock.now),
						new ModelData("Monster", MONSTER_SIZE, monsterColor, MONSTER_MATERIAL, MONSTER_Y_OFFSET),
					);
					nem.monsters.set(monster.id, entity);
				} else {
					const prev = world.get(existing, ClientPosition);
					commands.set(existing, PreviousPosition, new PreviousPosition(prev !== undefined ? prev.value : monster.position, clock.now));
					commands.set(existing, ClientPosition, new ClientPosition(monster.position));
					commands.set(existing, ModelData, new ModelData("Monster", MONSTER_SIZE, monsterColor, MONSTER_MATERIAL, MONSTER_Y_OFFSET));
				}
			}
			for (const [id, entity] of nem.monsters) {
				if (!liveMonsters.has(id)) {
					commands.despawn(entity);
					nem.monsters.delete(id);
				}
			}

			const liveProjectiles = new Set<number>();
			for (const projectile of snap.projectiles) {
				liveProjectiles.add(projectile.id);
				const existing = nem.projectiles.get(projectile.id);
				if (!hasLiveEntity(world, existing, ClientProjectile)) {
					if (existing !== undefined) nem.projectiles.delete(projectile.id);
					const entity = world.spawn(
						new ClientProjectile(),
						new NetworkId(projectile.id),
						new ClientPosition(projectile.position),
						new PreviousPosition(projectile.position, clock.now),
						new ModelData("Projectile", PROJECTILE_SIZE, PROJECTILE_COLOR, PROJECTILE_MATERIAL, PROJECTILE_Y_OFFSET),
					);
					nem.projectiles.set(projectile.id, entity);
				} else {
					const prev = world.get(existing, ClientPosition);
					commands.set(existing, PreviousPosition, new PreviousPosition(prev !== undefined ? prev.value : projectile.position, clock.now));
					commands.set(existing, ClientPosition, new ClientPosition(projectile.position));
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
