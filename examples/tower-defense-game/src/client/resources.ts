import RovyUi from "@rovy/ui";
import { $collectRef, resource } from "@rovy/core";
import type { Entity } from "@rovy/core";
import { PLAYER_MAX_HEALTH, WavePhase } from "shared/contracts";
import { LocalClientCollect } from "./collectors";

@resource
export class ClientClock {
	now = 0;
	delta = 0;
}

@resource
export class RenderRegistry {
	rootFolder?: Folder;
}

@resource
export class NetworkEntityMap {
	zombies = new Map<number, Entity>();
	projectiles = new Map<number, Entity>();
}

@resource
export class HudState {
	phase: WavePhase = "intermission";
	waveNumber = 0;
	enemiesRemaining = 0;
	score = 0;
	kills = 0;
	shotsFired = 0;
	combo = 0;
	bestCombo = 0;
	playerHealth = PLAYER_MAX_HEALTH;
	playerMaxHealth = PLAYER_MAX_HEALTH;
	gameOver = false;
	paused = false;
}

@resource
export class HudUiState {
	gui?: ScreenGui;
	node?: ReturnType<typeof RovyUi.new>;
	rendering = false;
	readonly local: LocalClientCollect = $collectRef<LocalClientCollect>();
}

@resource
export class LocalPlayerState {
	character?: Model;
	shotSequence = 0;
	userId = 0;
}
