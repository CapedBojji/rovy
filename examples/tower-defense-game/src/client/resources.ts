import RovyUi from "@rovy/ui";
import { inspect, resource } from "@rovy/core";
import type { Entity } from "@rovy/core";

@inspect
@resource
export class ClientClock {
	now = 0;
	delta = 0;
	frame = 0;
	nextHeartbeatIn = 0;
}

@resource
export class RenderRegistry {
	rootFolder?: Folder;
}

@resource
export class NetworkEntityMap {
	monsters = new Map<number, Entity>();
	projectiles = new Map<number, Entity>();
	turret?: Entity;
}

@inspect
@resource
export class ClientPlaybackState {
	lastSnapshotTick = 0;
	snapshotsReceived = 0;
	lastDamageEvents = 0;
	lastClientHeartbeatFrame = 0;
}

@inspect
@resource
export class HudState {
	serverTick = 0;
	simTime = 0;
	monstersSpawned = 0;
	monstersKilled = 0;
	monstersEscaped = 0;
	damageEvents = 0;
	totalLeakDamage = 0;
	shotsFired = 0;
	activeMonsters = 0;
	activeProjectiles = 0;
	lastDamageAmount = 0;
	lastClientFrameSeenByServer = 0;
}

@resource
export class HudUiState {
	gui?: ScreenGui;
	node?: ReturnType<typeof RovyUi.new>;
	rendering = false;
}
