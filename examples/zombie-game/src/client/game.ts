/**
 * Client-side Rovy runtime: snapshot inbox, render systems, HUD state.
 *
 * Owns nothing simulation-y. It only:
 *   * stores the last two snapshots so render systems can interpolate
 *   * keeps a `RenderRegistry` of Roblox parts for each wire id
 *   * exposes `HudState` for the egooe HUD to render
 *   * routes user input → outbound fire/restart events via `ClientBridge`
 */

import {
	App,
	Commands,
	EventReader,
	Res,
	ResMut,
	component,
	event,
	resource,
	schedule,
	system,
	SystemSet,
} from "@rovy/core";

import {
	FireWeaponRequestPayload,
	PLAYER_MAX_HEALTH,
	ProjectileSnapshot,
	SNAPSHOT_INTERVAL,
	WavePhase,
	WorldSnapshotPayload,
	ZombieSnapshot,
} from "shared/contracts";

// ── Schedules + sets ──────────────────────────────────────────────────────

@schedule
export class Render {}

export class InputSet extends SystemSet {}
export class SnapshotSet extends SystemSet {}
export class RenderSet extends SystemSet {}
export class HudSet extends SystemSet {}

// ── Resources ─────────────────────────────────────────────────────────────

@resource
export class ClientClock {
	now = 0;
	delta = 0;
}

@resource
export class SnapshotInbox {
	latest?: WorldSnapshotPayload;
	receivedAt = 0;
	sequence = 0;
}

@resource
export class SnapshotBufferState {
	previous?: WorldSnapshotPayload;
	current?: WorldSnapshotPayload;
	currentReceivedAt = 0;
	lastSequence = -1;
}

@resource
export class RenderRegistry {
	rootFolder?: Folder;
	zombieParts = new Map<number, Part>();
	projectileParts = new Map<number, Part>();
}

@resource
export class HudState {
	phase: WavePhase = "intermission";
	waveNumber = 0;
	enemiesRemaining = 0;
	playerHealth = PLAYER_MAX_HEALTH;
	playerMaxHealth = PLAYER_MAX_HEALTH;
	gameOver = false;
}

@resource
export class ClientBridge {
	sendFire?: (request: FireWeaponRequestPayload) => void;
	sendRestart?: () => void;
}

@resource
export class LocalPlayerState {
	character?: Model;
	shotSequence = 0;
	userId = 0;
}

// ── Events ────────────────────────────────────────────────────────────────

@event({ capacity: 16 })
export class LocalFireIntent {
	constructor(
		public origin: Vector3 = new Vector3(),
		public direction: Vector3 = new Vector3(0, 0, -1),
	) {}
}

@event({ capacity: 4 })
export class LocalRestartIntent {}

// ── Components (none today; render state lives in resources) ──────────────

@component
export class RenderTag {}

// ── Helpers ───────────────────────────────────────────────────────────────

const ZOMBIE_SIZE = new Vector3(4, 6, 4);
const PROJECTILE_SIZE = new Vector3(1, 1, 1.5);
const ZOMBIE_COLOR = Color3.fromRGB(60, 160, 60);
const PROJECTILE_COLOR = Color3.fromRGB(245, 215, 55);

function ensureRootFolder(reg: RenderRegistry): Folder {
	if (reg.rootFolder !== undefined && reg.rootFolder.Parent !== undefined) return reg.rootFolder;
	const folder = new Instance("Folder");
	folder.Name = "ZombieGameClientRender";
	folder.Parent = game.Workspace;
	reg.rootFolder = folder;
	return folder;
}

function createZombiePart(reg: RenderRegistry, id: number, position: Vector3): Part {
	const folder = ensureRootFolder(reg);
	const part = new Instance("Part");
	part.Name = `Zombie_${id}`;
	part.Anchored = true;
	part.CanCollide = false;
	part.CanQuery = false;
	part.CanTouch = false;
	part.Material = Enum.Material.SmoothPlastic;
	part.Color = ZOMBIE_COLOR;
	part.Size = ZOMBIE_SIZE;
	part.CFrame = new CFrame(position.add(new Vector3(0, ZOMBIE_SIZE.Y / 2, 0)));
	part.Parent = folder;
	return part;
}

function createProjectilePart(reg: RenderRegistry, id: number, position: Vector3): Part {
	const folder = ensureRootFolder(reg);
	const part = new Instance("Part");
	part.Name = `Projectile_${id}`;
	part.Anchored = true;
	part.CanCollide = false;
	part.CanQuery = false;
	part.CanTouch = false;
	part.Material = Enum.Material.Neon;
	part.Color = PROJECTILE_COLOR;
	part.Size = PROJECTILE_SIZE;
	part.CFrame = new CFrame(position);
	part.Parent = folder;
	return part;
}

function lerpVector(a: Vector3, b: Vector3, alpha: number): Vector3 {
	return a.add(b.sub(a).mul(alpha));
}

// ── Systems ───────────────────────────────────────────────────────────────

@system({ schedule: Render, set: InputSet })
class TickClientClock {
	run(clock: ResMut<ClientClock>) {
		// The bootstrap sets clock.delta before runSchedule(Render); we just advance now.
		clock.now += clock.delta;
	}
}

@system({ schedule: Render, set: SnapshotSet })
class ApplySnapshotInbox {
	run(
		inbox: ResMut<SnapshotInbox>,
		buffer: ResMut<SnapshotBufferState>,
		clock: Res<ClientClock>,
		hud: ResMut<HudState>,
	) {
		if (inbox.latest === undefined) return;
		if (inbox.sequence === buffer.lastSequence) return;
		buffer.previous = buffer.current;
		buffer.current = inbox.latest;
		buffer.currentReceivedAt = clock.now;
		buffer.lastSequence = inbox.sequence;

		const snap = inbox.latest;
		hud.phase = snap.phase;
		hud.waveNumber = snap.waveNumber;
		hud.enemiesRemaining = snap.enemiesRemaining;
		hud.playerHealth = snap.playerHealth;
		hud.playerMaxHealth = snap.playerMaxHealth;
		hud.gameOver = snap.phase === "defeat";
	}
}

@system({ schedule: Render, set: RenderSet })
class RenderSnapshots {
	run(buffer: Res<SnapshotBufferState>, reg: ResMut<RenderRegistry>, clock: Res<ClientClock>) {
		const current = buffer.current;
		if (current === undefined) return;
		const previous = buffer.previous;
		const dt = clock.now - buffer.currentReceivedAt;
		const alpha = math.clamp(dt / SNAPSHOT_INTERVAL, 0, 1);

		// Zombies — index previous by id for interpolation lookup.
		const prevZombies = new Map<number, ZombieSnapshot>();
		if (previous !== undefined) {
			for (const z of previous.zombies) prevZombies.set(z.id, z);
		}
		const seenZombies = new Set<number>();
		for (const z of current.zombies) {
			seenZombies.add(z.id);
			const prev = prevZombies.get(z.id);
			const pos = prev !== undefined ? lerpVector(prev.position, z.position, alpha) : z.position;
			let part = reg.zombieParts.get(z.id);
			if (part === undefined || part.Parent === undefined) {
				part = createZombiePart(reg, z.id, pos);
				reg.zombieParts.set(z.id, part);
			}
			part.CFrame = new CFrame(pos.add(new Vector3(0, ZOMBIE_SIZE.Y / 2, 0)));
		}
		for (const [id, part] of reg.zombieParts) {
			if (!seenZombies.has(id)) {
				part.Destroy();
				reg.zombieParts.delete(id);
			}
		}

		// Projectiles — same pattern.
		const prevProjectiles = new Map<number, ProjectileSnapshot>();
		if (previous !== undefined) {
			for (const p of previous.projectiles) prevProjectiles.set(p.id, p);
		}
		const seenProjectiles = new Set<number>();
		for (const p of current.projectiles) {
			seenProjectiles.add(p.id);
			const prev = prevProjectiles.get(p.id);
			const pos = prev !== undefined ? lerpVector(prev.position, p.position, alpha) : p.position;
			let part = reg.projectileParts.get(p.id);
			if (part === undefined || part.Parent === undefined) {
				part = createProjectilePart(reg, p.id, pos);
				reg.projectileParts.set(p.id, part);
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

@system({ schedule: Render, set: HudSet })
class EmitFireRequest {
	run(events: EventReader<LocalFireIntent>, bridge: ResMut<ClientBridge>, localPlayer: ResMut<LocalPlayerState>) {
		const send = bridge.sendFire;
		if (send === undefined) {
			// Drain anyway so we don't accumulate forever.
			events.forEach(() => {});
			return;
		}
		events.forEach((evt) => {
			localPlayer.shotSequence += 1;
			const request = new FireWeaponRequestPayload(
				localPlayer.userId,
				localPlayer.shotSequence,
				evt.origin,
				evt.direction,
			);
			send(request);
		});
	}
}

@system({ schedule: Render, set: HudSet })
class EmitRestartRequest {
	run(events: EventReader<LocalRestartIntent>, bridge: Res<ClientBridge>) {
		const send = bridge.sendRestart;
		if (send === undefined) {
			events.forEach(() => {});
			return;
		}
		events.forEach(() => send());
	}
}

// ── External hooks ─────────────────────────────────────────────────────────

export function boot(): App {
	const app = new App();
	app.configureSets(Render, [InputSet, SnapshotSet, RenderSet, HudSet]);
	app.start();
	return app;
}

export function deliverSnapshot(app: App, snapshot: WorldSnapshotPayload): void {
	const inbox = app.world.resource(SnapshotInbox);
	const clock = app.world.resource(ClientClock);
	inbox.latest = snapshot;
	inbox.receivedAt = clock.now;
	inbox.sequence += 1;
}

export function setClockDelta(app: App, dt: number): void {
	const clock = app.world.resource(ClientClock);
	clock.delta = dt;
}

export function setLocalPlayer(app: App, userId: number): void {
	const state = app.world.resource(LocalPlayerState);
	state.userId = userId;
}

export function setLocalCharacter(app: App, character: Model | undefined): void {
	const state = app.world.resource(LocalPlayerState);
	state.character = character;
}

export function emitLocalFire(app: App, origin: Vector3, direction: Vector3): void {
	app.commands.send(new LocalFireIntent(origin, direction));
	app.flush();
}

export function emitLocalRestart(app: App): void {
	app.commands.send(new LocalRestartIntent());
	app.flush();
}

export function installFireBridge(app: App, sender: (request: FireWeaponRequestPayload) => void): void {
	app.world.resource(ClientBridge).sendFire = sender;
}

export function installRestartBridge(app: App, sender: () => void): void {
	app.world.resource(ClientBridge).sendRestart = sender;
}

export function readHudState(app: App): HudState {
	return app.world.resource(HudState);
}
