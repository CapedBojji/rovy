import { schedule, SystemSet } from "@rovy/core";
import { PATH_END_X, PATH_LENGTH, PATH_START_X, SNAPSHOT_INTERVAL } from "shared/contracts";
import { ServerClock, SnapshotState } from "./resources";
import type { Res } from "@rovy/core";

@schedule
export class Update {}

export class IngressSet extends SystemSet {}
export class SpawnSet extends SystemSet {}
export class CombatSet extends SystemSet {}
export class MovementSet extends SystemSet {}
export class CleanupSet extends SystemSet {}
export class SnapshotSet extends SystemSet {}

export function pathProgress(x: number): number {
	return math.clamp((x - PATH_START_X) / PATH_LENGTH, 0, 1);
}

export function tickSnapshotAccumulator(clock: Res<ServerClock>, snap: SnapshotState): boolean {
	snap.sendAccumulator += clock.fixedDelta;
	if (snap.sendAccumulator < SNAPSHOT_INTERVAL) return false;
	snap.sendAccumulator = 0;
	return true;
}

export { PATH_END_X };
