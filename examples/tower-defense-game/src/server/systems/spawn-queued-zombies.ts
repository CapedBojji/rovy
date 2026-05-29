import { Commands, Res, ResMut, system } from "@rovy/core";
import { ContactCooldown, Damage, Health, MoveSpeed, PathProgress, Position, Radius, Velocity, WireId, Zombie } from "../components";
import { ArenaState, DevPauseState, ServerClock, SmokeStats, WaveState, WireIdAllocator } from "../resources";
import {
	ringSpawnPosition,
	Update,
	WaveSet,
	zombieHealth,
	zombieSpeed,
	ZOMBIE_RADIUS,
} from "../state";
import { ZOMBIE_CONTACT_DAMAGE, ZOMBIE_SPAWN_INTERVAL } from "shared/contracts";
import { AdvanceWaveState } from "./advance-wave-state";

@system({ schedule: Update, set: WaveSet, after: [AdvanceWaveState] })
export class SpawnQueuedZombies {
	run(
		commands: Commands,
		clock: Res<ServerClock>,
		pause: Res<DevPauseState>,
		wave: ResMut<WaveState>,
		arena: Res<ArenaState>,
		ids: ResMut<WireIdAllocator>,
		stats: ResMut<SmokeStats>,
	) {
		if (pause.paused) return;
		if (wave.phase !== "wave") return;
		if (wave.spawnRemaining <= 0) return;
		if (wave.spawnCooldown > 0) {
			wave.spawnCooldown = math.max(0, wave.spawnCooldown - clock.fixedDelta);
			return;
		}

		const position = ringSpawnPosition(arena, wave.spawnIndex);
		wave.spawnIndex += 1;
		const hp = zombieHealth(wave.waveNumber);
		const speed = zombieSpeed(wave.waveNumber);

		commands.spawn(
			Zombie,
			new WireId(ids.allocate()),
			new Position(position),
			new Velocity(new Vector3()),
			new PathProgress(0),
			new Health(hp, hp),
			new Radius(ZOMBIE_RADIUS),
			new MoveSpeed(speed),
			new Damage(ZOMBIE_CONTACT_DAMAGE),
			new ContactCooldown(0),
		);

		wave.spawnRemaining -= 1;
		wave.spawnCooldown = ZOMBIE_SPAWN_INTERVAL;
		stats.zombiesSpawned += 1;
	}
}
