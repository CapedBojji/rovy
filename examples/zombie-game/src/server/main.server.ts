/**
 * Server entry point. Boots the Rovy app, wires player/character lifecycle,
 * drives a fixed-step accumulator off `RunService.Heartbeat`, attaches the
 * Flamework remote bridge, and creates the block-gun tool.
 *
 * Also exposes `runZombieGameSmoke` so the lune harness can drive the same
 * server runtime headlessly without touching Players / RunService.
 *
 * The top-level engine attachment is gated behind a pcall check on
 * `game.GetService("RunService")` — the lune harness exposes a stub game
 * object that throws on unknown services, so the smoke can `require` this
 * module without booting the engine half.
 */

import { App, rovy } from "@rovy/core";
import {
	FireWeaponRequestPayload,
	INITIAL_INTERMISSION_SECONDS,
	PLAYER_MAX_HEALTH,
	RestartRequestPayload,
	SERVER_FIXED_DELTA,
	WorldSnapshotPayload,
	ZombieGameSmokeResult,
	fireWeaponRequestSerializer,
	restartRequestSerializer,
	worldSnapshotSerializer,
} from "shared/contracts";

function loadGameModule() {
	const ss = game.GetService("ServerScriptService").WaitForChild("TS");
	const module = ss.WaitForChild("game") as ModuleScript;
	return require(module) as typeof import("server/game");
}

function loadNetworkModule() {
	const rs = game.GetService("ReplicatedStorage").WaitForChild("TS");
	const module = rs.WaitForChild("network") as ModuleScript;
	return require(module) as typeof import("shared/network");
}

const TOOL_NAME = "Block Blaster";

/** Build the gun tool template under ServerStorage; returns the template. */
function ensureToolTemplate(): Tool {
	const serverStorage = game.GetService("ServerStorage");
	const existing = serverStorage.FindFirstChild(TOOL_NAME);
	if (existing && existing.IsA("Tool")) return existing;

	const tool = new Instance("Tool");
	tool.Name = TOOL_NAME;
	tool.RequiresHandle = true;
	tool.CanBeDropped = false;

	const handle = new Instance("Part");
	handle.Name = "Handle";
	handle.Size = new Vector3(0.8, 0.6, 1.6);
	handle.Color = Color3.fromRGB(20, 20, 20);
	handle.Material = Enum.Material.Metal;
	handle.TopSurface = Enum.SurfaceType.Smooth;
	handle.BottomSurface = Enum.SurfaceType.Smooth;
	handle.Parent = tool;

	tool.Parent = serverStorage;
	return tool;
}

function giveToolTo(player: Player): void {
	const template = ensureToolTemplate();
	const backpack = player.FindFirstChildOfClass("Backpack");
	if (backpack && !backpack.FindFirstChild(TOOL_NAME)) {
		const clone = template.Clone();
		clone.Parent = backpack;
	}
	const starter = player.FindFirstChild("StarterGear");
	if (starter && !starter.FindFirstChild(TOOL_NAME)) {
		const clone = template.Clone();
		clone.Parent = starter;
	}
}

/** Booted state shared between engine attach and the smoke helper. */
interface ServerRuntime {
	app: App;
	game: typeof import("server/game");
}

function bootRuntime(): ServerRuntime {
	rovy.__reset();
	rovy.loadPaths("src/shared", "src/server");
	const gameModule = loadGameModule();
	const app = gameModule.boot();
	return { app, game: gameModule };
}

/** Connect Players / RunService / RemoteEvents on top of a booted runtime. */
function attachEngineHooks({ app, game: gameMod }: ServerRuntime): void {
	const Players = game.GetService("Players");
	const RunService = game.GetService("RunService");
	const network = loadNetworkModule();

	const onPlayerAdded = (player: Player) => {
		gameMod.registerPlayer(app, player.UserId, player);
		giveToolTo(player);
		player.CharacterAdded.Connect((character) => {
			gameMod.attachCharacter(app, player.UserId, character);
		});
		if (player.Character) {
			gameMod.attachCharacter(app, player.UserId, player.Character);
		}
		player.CharacterRemoving.Connect(() => {
			gameMod.detachCharacter(app, player.UserId);
		});
	};
	for (const player of Players.GetPlayers()) onPlayerAdded(player);
	Players.PlayerAdded.Connect(onPlayerAdded);
	Players.PlayerRemoving.Connect((player) => {
		gameMod.unregisterPlayer(app, player.UserId);
	});

	const server = network.GlobalEvents.createServer({});
	server.fireWeapon.connect((player: Player, bytes: buffer) => {
		const request = fireWeaponRequestSerializer.deserialize(bytes, []);
		gameMod.handleFireRequest(app, player.UserId, request);
	});
	server.requestRestart.connect((player: Player, _bytes: buffer) => {
		gameMod.handleRestartRequest(app, player.UserId);
	});

	let accumulator = 0;
	RunService.Heartbeat.Connect((dt) => {
		accumulator += dt;
		if (accumulator > 0.25) accumulator = 0.25;
		while (accumulator >= SERVER_FIXED_DELTA) {
			accumulator -= SERVER_FIXED_DELTA;
			gameMod.syncPlayerPositions(app, (_userId, character) => {
				const model = character as Model;
				const root = model.FindFirstChild("HumanoidRootPart");
				if (root && root.IsA("BasePart")) return root.Position;
				return undefined;
			});
			gameMod.stepFixed(app);
		}
		const bytes = gameMod.takeLatestSnapshotBytes(app);
		if (bytes !== undefined) {
			server.worldSnapshot.broadcast(bytes);
		}
	});
}

// Boot real engine attachment only if RunService resolves (skipped in lune).
const [hasRunService] = pcall(() => game.GetService("RunService"));
if (hasRunService) {
	const runtime = bootRuntime();
	attachEngineHooks(runtime);
	print("[zombie-game] server runtime online");
}

// ── Smoke helper (lune-driven, no engine deps) ───────────────────────────

/**
 * Drive the server runtime deterministically. The lune harness loads this
 * file but skips `attachEngineHooks` because `game.GetService("RunService")`
 * throws in the stub. Asserts in `test/smoke.luau` compare these fields.
 */
export function runZombieGameSmoke(): ZombieGameSmokeResult {
	const { app, game: gameMod } = bootRuntime();

	const userId = 1001;
	const playerEntity = gameMod.registerPlayer(app, userId);
	const arena = app.world.resource(gameMod.ArenaState);
	gameMod.setPlayerPosition(app, userId, arena.center);

	let ticksRan = 0;
	const stepN = (count: number) => {
		for (let i = 0; i < count; i++) {
			gameMod.stepFixed(app);
			ticksRan += 1;
		}
	};

	// Initial intermission + first spawn cycle.
	const intermissionTicks = math.ceil(INITIAL_INTERMISSION_SECONDS / SERVER_FIXED_DELTA) + 4;
	stepN(intermissionTicks);

	// Fire shots straight along +X until at least one zombie dies.
	for (let attempt = 0; attempt < 240; attempt++) {
		const stats = app.world.resource(gameMod.SmokeStats);
		if (stats.zombiesKilled > 0) break;
		gameMod.handleFireRequest(
			app,
			userId,
			new FireWeaponRequestPayload(userId, attempt, arena.center, new Vector3(1, 0, 0)),
		);
		stepN(8);
	}

	// Drive the player to defeat. Contact damage is exact, but we apply a
	// fallback chunk so the loop terminates if the zombies wander past us.
	for (let attempt = 0; attempt < 300; attempt++) {
		const health = app.world.get(playerEntity, gameMod.Health);
		if (health !== undefined && health.current <= 0) break;
		stepN(2);
		const after = app.world.get(playerEntity, gameMod.Health);
		if (after !== undefined && after.current > 0) {
			const nextHealth = math.max(0, after.current - 12);
			app.world.set(playerEntity, gameMod.Health, new gameMod.Health(nextHealth, after.max));
		}
	}

	stepN(2);
	const defeatReached = app.world.resource(gameMod.WaveState).phase === "defeat";

	gameMod.handleRestartRequest(app, userId);
	stepN(2);

	const wave = app.world.resource(gameMod.WaveState);
	const stats = app.world.resource(gameMod.SmokeStats);
	const snap = app.world.resource(gameMod.SnapshotState);
	const playerHealth = app.world.get(playerEntity, gameMod.Health);

	// Round-trip a representative snapshot through the serializer.
	const probe = new WorldSnapshotPayload(
		7,
		"wave",
		3,
		5,
		42,
		PLAYER_MAX_HEALTH,
		new Vector3(1, 2, 3),
		[{ id: 1, position: new Vector3(4, 5, 6), health: 10, maxHealth: 60 }],
		[{ id: 2, position: new Vector3(7, 8, 9) }],
	);
	const serialized = worldSnapshotSerializer.serialize(probe);
	const decoded = worldSnapshotSerializer.deserialize(serialized.buffer, serialized.blobs);

	// Also exercise the request serializers so an unused-import error doesn't
	// surface and so a regression in the request shape is caught here.
	const fireBytes = fireWeaponRequestSerializer.serialize(
		new FireWeaponRequestPayload(userId, 99, new Vector3(), new Vector3(1, 0, 0)),
	);
	const fireDecoded = fireWeaponRequestSerializer.deserialize(fireBytes.buffer, fireBytes.blobs);
	const restartBytes = restartRequestSerializer.serialize(new RestartRequestPayload(0));
	void restartBytes;
	const requestsOk = fireDecoded.shooterUserId === userId && fireDecoded.shotSequence === 99;

	const roundTripOk =
		requestsOk &&
		decoded.serverTick === probe.serverTick &&
		decoded.phase === probe.phase &&
		decoded.waveNumber === probe.waveNumber &&
		decoded.enemiesRemaining === probe.enemiesRemaining &&
		decoded.zombies.size() === probe.zombies.size() &&
		decoded.projectiles.size() === probe.projectiles.size();

	return {
		started: app.isStarted(),
		ticksRan,
		waveNumber: wave.waveNumber,
		phase: wave.phase,
		zombiesSpawned: stats.zombiesSpawned,
		zombiesKilled: stats.zombiesKilled,
		shotsFired: stats.shotsFired,
		playerHealth: playerHealth?.current ?? -1,
		defeatReached,
		restartApplied: stats.restartApplied,
		snapshotCount: snap.snapshotCount,
		serializerRoundTripOk: roundTripOk,
	};
}
