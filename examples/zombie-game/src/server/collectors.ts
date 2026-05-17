import { Collector, collect } from "@rovy/core";
import { FireWeaponRequestPayload, fireWeaponRequestSerializer } from "shared/contracts";
import { getGlobalServer } from "./network";

export type PlayerLifecycleIngress =
	| { kind: "playerAdded"; userId: number }
	| { kind: "playerRemoving"; userId: number }
	| { kind: "characterAdded"; userId: number; character: defined }
	| { kind: "characterRemoving"; userId: number };

export type RemoteIngress =
	| { kind: "fire"; userId: number; request: FireWeaponRequestPayload }
	| { kind: "restart"; userId: number };

let activeLifecycleCollector: PlayerLifecycleCollect | undefined;
let activeRemoteCollector: RemoteIngressCollect | undefined;

function enqueueCollector<T extends defined>(collector: Collector<T> | undefined, value: T): void {
	(collector as (Collector<T> & { enqueue(value: T): void }) | undefined)?.enqueue(value);
}

@collect
export class PlayerLifecycleCollect extends Collector<PlayerLifecycleIngress> {
	constructor() {
		super();
		activeLifecycleCollector = this;
		const [ok, players] = pcall(() => game.GetService("Players"));
		if (!ok) return;

		const onPlayerAdded = (player: Player) => {
			this.enqueue({ kind: "playerAdded", userId: player.UserId });
			player.CharacterAdded.Connect((character) => {
				this.enqueue({ kind: "characterAdded", userId: player.UserId, character });
			});
			player.CharacterRemoving.Connect(() => {
				this.enqueue({ kind: "characterRemoving", userId: player.UserId });
			});
			if (player.Character) {
				this.enqueue({ kind: "characterAdded", userId: player.UserId, character: player.Character });
			}
		};

		for (const player of players.GetPlayers()) onPlayerAdded(player);
		players.PlayerAdded.Connect(onPlayerAdded);
		players.PlayerRemoving.Connect((player: Player) => {
			this.enqueue({ kind: "playerRemoving", userId: player.UserId });
		});
	}
}

@collect
export class RemoteIngressCollect extends Collector<RemoteIngress> {
	constructor() {
		super();
		activeRemoteCollector = this;
		const [ok, server] = pcall(getGlobalServer);
		if (!ok) return;

		server.fireWeapon.connect((player: Player, bytes: buffer) => {
			const request = fireWeaponRequestSerializer.deserialize(bytes, []);
			this.enqueue({ kind: "fire", userId: player.UserId, request });
		});
		server.requestRestart.connect((player: Player, _bytes: buffer) => {
			this.enqueue({ kind: "restart", userId: player.UserId });
		});
	}
}

export function enqueueSmokePlayerAdded(userId: number): void {
	enqueueCollector(activeLifecycleCollector, { kind: "playerAdded", userId });
}

export function enqueueSmokePlayerRemoving(userId: number): void {
	enqueueCollector(activeLifecycleCollector, { kind: "playerRemoving", userId });
}

export function enqueueSmokeCharacterAdded(userId: number, character: defined): void {
	enqueueCollector(activeLifecycleCollector, { kind: "characterAdded", userId, character });
}

export function enqueueSmokeCharacterRemoving(userId: number): void {
	enqueueCollector(activeLifecycleCollector, { kind: "characterRemoving", userId });
}

export function enqueueSmokeFireRequest(userId: number, request: FireWeaponRequestPayload): void {
	enqueueCollector(activeRemoteCollector, { kind: "fire", userId, request });
}

export function enqueueSmokeRestartRequest(userId: number): void {
	enqueueCollector(activeRemoteCollector, { kind: "restart", userId });
}
