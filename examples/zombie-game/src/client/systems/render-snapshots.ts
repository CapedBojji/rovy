import { Res, ResMut, system } from "@rovy/core";
import { ClientClock, RenderRegistry, SnapshotBufferState } from "../resources";
import {
	createProjectilePart,
	createZombiePart,
	lerpVector,
	Render,
	RenderSet,
	SNAPSHOT_INTERVAL,
} from "../state";

@system({ schedule: Render, set: RenderSet })
export class RenderSnapshots {
	run(buffer: Res<SnapshotBufferState>, reg: ResMut<RenderRegistry>, clock: Res<ClientClock>) {
		const current = buffer.current;
		if (current === undefined) return;
		const previous = buffer.previous;
		const alpha = math.clamp((clock.now - buffer.currentReceivedAt) / SNAPSHOT_INTERVAL, 0, 1);

		const prevZombies = new Map<number, (typeof current.zombies)[number]>();
		if (previous !== undefined) {
			for (const zombie of previous.zombies) prevZombies.set(zombie.id, zombie);
		}
		const seenZombies = new Set<number>();
		for (const zombie of current.zombies) {
			seenZombies.add(zombie.id);
			const prev = prevZombies.get(zombie.id);
			const pos = prev !== undefined ? lerpVector(prev.position, zombie.position, alpha) : zombie.position;
			let part = reg.zombieParts.get(zombie.id);
			if (part === undefined || part.Parent === undefined) {
				part = createZombiePart(reg, zombie.id, pos);
				reg.zombieParts.set(zombie.id, part);
			}
			part.CFrame = new CFrame(pos.add(new Vector3(0, 3, 0)));
		}
		for (const [id, part] of reg.zombieParts) {
			if (!seenZombies.has(id)) {
				part.Destroy();
				reg.zombieParts.delete(id);
			}
		}

		const prevProjectiles = new Map<number, (typeof current.projectiles)[number]>();
		if (previous !== undefined) {
			for (const projectile of previous.projectiles) prevProjectiles.set(projectile.id, projectile);
		}
		const seenProjectiles = new Set<number>();
		for (const projectile of current.projectiles) {
			seenProjectiles.add(projectile.id);
			const prev = prevProjectiles.get(projectile.id);
			const pos = prev !== undefined ? lerpVector(prev.position, projectile.position, alpha) : projectile.position;
			let part = reg.projectileParts.get(projectile.id);
			if (part === undefined || part.Parent === undefined) {
				part = createProjectilePart(reg, projectile.id, pos);
				reg.projectileParts.set(projectile.id, part);
			}
			part.CFrame = new CFrame(pos);
		}
		for (const [id, part] of reg.projectileParts) {
			if (!seenProjectiles.has(id)) {
				part.Destroy();
				reg.projectileParts.delete(id);
			}
		}
	}
}
