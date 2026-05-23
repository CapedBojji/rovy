import { netEvent } from "@rovy/networking";
import {
	FireWeaponRequestPayload,
	RestartRequestPayload,
	TogglePauseRequestPayload,
	WorldSnapshotPayload,
} from "./contracts";

type WireVector3 = { x: number; y: number; z: number };
type WireZombieSnapshot = {
	id: number;
	position: WireVector3;
	health: number;
	maxHealth: number;
};
type WireProjectileSnapshot = {
	id: number;
	position: WireVector3;
};

type FireWeaponRequestWire = {
	shooterUserId: number;
	shotSequence: number;
	origin: WireVector3;
	direction: WireVector3;
};

type RestartRequestWire = {
	clientTime: number;
};

type WorldSnapshotWire = {
	serverTick: number;
	phase: "intermission" | "wave" | "defeat";
	waveNumber: number;
	enemiesRemaining: number;
	playerHealth: number;
	playerMaxHealth: number;
	playerPosition: WireVector3;
	zombies: Array<WireZombieSnapshot>;
	projectiles: Array<WireProjectileSnapshot>;
	paused: boolean;
};

@netEvent({ direction: "clientToServer", receive: "send" })
export class FireWeaponRequestNet {
	constructor(
		public shooterUserId: number = 0,
		public shotSequence: number = 0,
		public origin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
		public direction: { x: number; y: number; z: number } = { x: 0, y: 0, z: -1 },
	) {}
}

@netEvent({ direction: "clientToServer", receive: "send" })
export class RestartRequestNet {
	constructor(public clientTime: number = 0) {}
}

@netEvent({ direction: "clientToServer", receive: "send" })
export class TogglePauseRequestNet {
	constructor(public paused: boolean = false) {}
}

@netEvent({ direction: "serverToClient", receive: "send" })
export class WorldSnapshotNet {
	constructor(
		public serverTick: number = 0,
		public phase: "intermission" | "wave" | "defeat" = "intermission",
		public waveNumber: number = 0,
		public enemiesRemaining: number = 0,
		public playerHealth: number = 0,
		public playerMaxHealth: number = 0,
		public playerPosition: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
		public zombies: Array<{
			id: number;
			position: { x: number; y: number; z: number };
			health: number;
			maxHealth: number;
		}> = [],
		public projectiles: Array<{
			id: number;
			position: { x: number; y: number; z: number };
		}> = [],
		public paused: boolean = false,
	) {}
}

function toWireVector3(value: Vector3): WireVector3 {
	return { x: value.X, y: value.Y, z: value.Z };
}

function fromWireVector3(value: WireVector3): Vector3 {
	return new Vector3(value.x, value.y, value.z);
}

export function toFireWeaponRequestNet(payload: FireWeaponRequestPayload): FireWeaponRequestNet {
	return new FireWeaponRequestNet(
		payload.shooterUserId,
		payload.shotSequence,
		toWireVector3(payload.origin),
		toWireVector3(payload.direction),
	);
}

export function fromFireWeaponRequestNet(event: FireWeaponRequestNet): FireWeaponRequestPayload {
	return new FireWeaponRequestPayload(
		event.shooterUserId,
		event.shotSequence,
		fromWireVector3(event.origin),
		fromWireVector3(event.direction),
	);
}

export function toRestartRequestNet(payload: RestartRequestPayload): RestartRequestNet {
	return new RestartRequestNet(payload.clientTime);
}

export function fromRestartRequestNet(event: RestartRequestNet): RestartRequestPayload {
	return new RestartRequestPayload(event.clientTime);
}

export function toTogglePauseRequestNet(payload: TogglePauseRequestPayload): TogglePauseRequestNet {
	return new TogglePauseRequestNet(payload.paused);
}

export function fromTogglePauseRequestNet(event: TogglePauseRequestNet): TogglePauseRequestPayload {
	return new TogglePauseRequestPayload(event.paused);
}

export function toWorldSnapshotNet(payload: WorldSnapshotPayload): WorldSnapshotNet {
	return new WorldSnapshotNet(
		payload.serverTick,
		payload.phase,
		payload.waveNumber,
		payload.enemiesRemaining,
		payload.playerHealth,
		payload.playerMaxHealth,
		toWireVector3(payload.playerPosition),
		payload.zombies.map((zombie) => ({
			id: zombie.id,
			position: toWireVector3(zombie.position),
			health: zombie.health,
			maxHealth: zombie.maxHealth,
		})),
		payload.projectiles.map((projectile) => ({
			id: projectile.id,
			position: toWireVector3(projectile.position),
		})),
		payload.paused,
	);
}

export function fromWorldSnapshotNet(event: WorldSnapshotNet): WorldSnapshotPayload {
	return new WorldSnapshotPayload(
		event.serverTick,
		event.phase,
		event.waveNumber,
		event.enemiesRemaining,
		event.playerHealth,
		event.playerMaxHealth,
		fromWireVector3(event.playerPosition),
		event.zombies.map((zombie) => ({
			id: zombie.id,
			position: fromWireVector3(zombie.position),
			health: zombie.health,
			maxHealth: zombie.maxHealth,
		})),
		event.projectiles.map((projectile) => ({
			id: projectile.id,
			position: fromWireVector3(projectile.position),
		})),
		event.paused,
	);
}
