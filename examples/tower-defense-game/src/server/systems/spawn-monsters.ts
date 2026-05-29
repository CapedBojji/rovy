import { Commands, Entity, Query, Res, ResMut, With, system } from "@rovy/core";
import { MONSTER_HEALTH, MONSTER_RADIUS, MONSTER_SPEED } from "shared/contracts";
import { Health, Monster, MoveSpeed, Position, Radius, ShotProfile, Velocity, WireId } from "../components";
import { PathState, ServerClock, SpawnState, TowerDefenseStats, WireIdAllocator } from "../resources";
import { SpawnSet, Update } from "../state";

@system({ schedule: Update, set: SpawnSet })
export class SpawnMonsters {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		path: Res<PathState>,
		spawn: ResMut<SpawnState>,
		ids: ResMut<WireIdAllocator>,
		stats: ResMut<TowerDefenseStats>,
		monsters: Query<[Entity], With<Monster>>,
	) {
		spawn.nextSpawnIn -= clock.fixedDelta;
		if (spawn.nextSpawnIn > 0) return;

		let activeMonsters = 0;
		monsters.forEach(() => {
			activeMonsters += 1;
		});
		stats.maxActiveMonstersObserved = math.max(stats.maxActiveMonstersObserved, activeMonsters);
		if (activeMonsters >= spawn.maxActive) return;

		const id = ids.allocate();
		const spawnIndex = spawn.nextSpawnIndex;
		const willBeHit = spawnIndex % 2 === 0;
		commands.spawn(
			Monster,
			new WireId(id),
			new Position(path.start),
			new Velocity(new Vector3(MONSTER_SPEED, 0, 0)),
			new MoveSpeed(MONSTER_SPEED),
			new Radius(MONSTER_RADIUS),
			new Health(MONSTER_HEALTH, MONSTER_HEALTH),
			new ShotProfile(spawnIndex, willBeHit, false),
		);
		stats.monstersSpawned += 1;
		stats.maxActiveMonstersObserved = math.max(stats.maxActiveMonstersObserved, activeMonsters + 1);
		spawn.nextSpawnIndex += 1;
		spawn.nextSpawnIn = spawn.spawnInterval;
	}
}
