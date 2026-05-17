import { Entity, Query, Res, SystemSet, schedule } from "@rovy/core";
import {
	PLAYER_MAX_HEALTH,
	SHOT_ORIGIN_CLAMP_RADIUS,
	SNAPSHOT_INTERVAL,
	ZOMBIE_BASE_HEALTH,
	ZOMBIE_BASE_SPEED,
	ZOMBIE_HEALTH_PER_WAVE,
	ZOMBIE_MAX_SPEED_BONUS,
	ZOMBIE_RADIUS,
	ZOMBIE_SPEED_PER_WAVE,
} from "shared/contracts";
import { Health, PlayerUnit, Position } from "./components";
import { ArenaState, ServerClock, SnapshotState } from "./resources";

@schedule
export class Update {}

export class IngressSet extends SystemSet {}
export class WaveSet extends SystemSet {}
export class MovementSet extends SystemSet {}
export class CombatSet extends SystemSet {}
export class CleanupSet extends SystemSet {}
export class SnapshotSet extends SystemSet {}

export function zombieHealth(wave: number): number {
	return ZOMBIE_BASE_HEALTH + math.max(0, wave - 1) * ZOMBIE_HEALTH_PER_WAVE;
}

export function zombieSpeed(wave: number): number {
	const bonus = math.min(math.max(0, wave - 1) * ZOMBIE_SPEED_PER_WAVE, ZOMBIE_MAX_SPEED_BONUS);
	return ZOMBIE_BASE_SPEED + bonus;
}

export function quotaForWave(wave: number): number {
	return 4 + wave * 2;
}

const GOLDEN_ANGLE = math.pi * (3 - math.sqrt(5));

export function ringSpawnPosition(arena: ArenaState, index: number): Vector3 {
	const angle = index * GOLDEN_ANGLE;
	const x = arena.center.X + math.cos(angle) * arena.zombieSpawnRadius;
	const z = arena.center.Z + math.sin(angle) * arena.zombieSpawnRadius;
	return new Vector3(x, arena.center.Y, z);
}

export function horizontalDistance(a: Vector3, b: Vector3): number {
	const dx = a.X - b.X;
	const dz = a.Z - b.Z;
	return math.sqrt(dx * dx + dz * dz);
}

export function horizontalDirection(from: Vector3, to: Vector3): Vector3 {
	const dx = to.X - from.X;
	const dz = to.Z - from.Z;
	const len = math.sqrt(dx * dx + dz * dz);
	if (len <= 1e-4) return new Vector3();
	return new Vector3(dx / len, 0, dz / len);
}

export function safeNormalize(v: Vector3): Vector3 {
	const m = v.Magnitude;
	if (m <= 1e-4) return new Vector3(0, 0, -1);
	return v.div(m);
}

export function clampShotOrigin(origin: Vector3, shooterPos: Vector3): Vector3 {
	const delta = origin.sub(shooterPos);
	const dist = delta.Magnitude;
	if (dist <= SHOT_ORIGIN_CLAMP_RADIUS) return origin;
	return shooterPos.add(delta.div(dist).mul(SHOT_ORIGIN_CLAMP_RADIUS));
}

export function nearestPlayer(
	players: Query<[Entity, PlayerUnit, Position, Health]>,
	from: Vector3,
): { entity: Entity; position: Vector3 } | undefined {
	let bestEntity: Entity | undefined;
	let bestPos: Vector3 | undefined;
	let bestDist = math.huge;
	players.forEach((entity, _unit, pos, health) => {
		if (health.current <= 0) return;
		const d = horizontalDistance(pos.value, from);
		if (d < bestDist) {
			bestDist = d;
			bestEntity = entity;
			bestPos = pos.value;
		}
	});
	if (bestEntity === undefined || bestPos === undefined) return undefined;
	return { entity: bestEntity, position: bestPos };
}

export function resolveCharacterPosition(character: defined): Vector3 | undefined {
	const model = character as Model;
	const root = model.FindFirstChild("HumanoidRootPart");
	if (root && root.IsA("BasePart")) return root.Position;
	return undefined;
}

export function tickSnapshotAccumulator(clock: Res<ServerClock>, snap: SnapshotState): boolean {
	snap.sendAccumulator += clock.fixedDelta;
	if (snap.sendAccumulator < SNAPSHOT_INTERVAL) return false;
	snap.sendAccumulator = 0;
	return true;
}

export { PLAYER_MAX_HEALTH, ZOMBIE_RADIUS };
