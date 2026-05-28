import { observer, Res, ResMut } from "@rovy/core";
import { BaseDamaged } from "../events";
import { ServerClock, TowerDefenseStats } from "../resources";

@observer({ event: BaseDamaged })
export class BaseDamageObserver {
	run(event: BaseDamaged, clock: Res<ServerClock>, stats: ResMut<TowerDefenseStats>) {
		stats.monstersEscaped += 1;
		stats.damageEvents += 1;
		stats.totalLeakDamage += event.amount;
		stats.lastDamageTick = clock.tick;
		stats.lastDamageAmount = event.amount;
		stats.lastEscapedMonsterId = event.monsterId;
	}
}
