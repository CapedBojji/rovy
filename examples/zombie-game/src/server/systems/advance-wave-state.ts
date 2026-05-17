import { Entity, Query, Res, ResMut, With, system } from "@rovy/core";
import { Health, PlayerUnit, Zombie } from "../components";
import { ServerClock, WaveState } from "../resources";
import { quotaForWave, Update, WaveSet } from "../state";
import { REGULAR_INTERMISSION_SECONDS } from "shared/contracts";

@system({ schedule: Update, set: WaveSet })
export class AdvanceWaveState {
	run(
		clock: Res<ServerClock>,
		wave: ResMut<WaveState>,
		zombies: Query<[Entity], With<Zombie>>,
		players: Query<[Entity, PlayerUnit, Health]>,
	) {
		const dt = clock.fixedDelta;
		if (wave.phase === "defeat") return;

		let anyAlive = false;
		players.forEach((_entity, _unit, health) => {
			if (health.current > 0) anyAlive = true;
		});
		if (!anyAlive && players.size() > 0) {
			wave.phase = "defeat";
			wave.spawnRemaining = 0;
			wave.spawnCooldown = 0;
			return;
		}

		if (wave.phase === "intermission") {
			wave.intermissionRemaining = math.max(0, wave.intermissionRemaining - dt);
			if (wave.intermissionRemaining <= 0) {
				wave.phase = "wave";
				wave.waveNumber += 1;
				wave.spawnRemaining = quotaForWave(wave.waveNumber);
				wave.spawnCooldown = 0;
			}
			return;
		}

		if (wave.spawnRemaining > 0) {
			wave.spawnCooldown = math.max(0, wave.spawnCooldown - dt);
		} else if (zombies.size() === 0) {
			wave.phase = "intermission";
			wave.intermissionRemaining = REGULAR_INTERMISSION_SECONDS;
		}
	}
}
