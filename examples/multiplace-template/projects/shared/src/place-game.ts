import {
	App,
	Entity,
	EventReader,
	Query,
	Res,
	ResMut,
	With,
	component,
	resource,
	schedule,
	system,
} from "@rovy/core";
import { NetClient, NetEventContext, NetServer, netEvent } from "@rovy/networking";

export interface PlaceDefinition {
	readonly id: string;
	readonly displayName: string;
	readonly accent: Color3;
}

export const LobbyPlace: PlaceDefinition = {
	id: "lobby",
	displayName: "Lobby",
	accent: Color3.fromRGB(84, 177, 255),
};

export const ArenaPlace: PlaceDefinition = {
	id: "arena",
	displayName: "Arena",
	accent: Color3.fromRGB(255, 124, 84),
};

@schedule
export class Update {}

@component
export class PlaceBeacon {
	constructor(
		public readonly label = "beacon",
		public readonly placeId = "unknown",
	) {}
}

@component
export class Position {
	constructor(public value = new Vector3()) {}
}

@resource
export class PlaceRuntime {
	id = "unknown";
	displayName = "Unknown";
	accent = Color3.fromRGB(255, 255, 255);
	tick = 0;
	networkTick = 0;
	playersSeen = 0;
	clientPingsSent = 0;
	clientSnapshotsSeen = 0;
	serverPingsReceived = 0;
	lastClientUserId = 0;
	lastSnapshotPlaceId = "";
}

@netEvent({ direction: "clientToServer", receive: "send" })
export class PlacePingNet {
	constructor(
		public placeId: string = "unknown",
		public userId: number = 0,
		public clientTick: number = 0,
	) {}
}

@netEvent({ direction: "serverToClient", receive: "send" })
export class PlaceSnapshotNet {
	constructor(
		public placeId: string = "unknown",
		public displayName: string = "Unknown",
		public serverTick: number = 0,
		public playersSeen: number = 0,
		public pingsReceived: number = 0,
	) {}
}

@system({ schedule: Update })
class AdvancePlaceRuntime {
	run(runtime: ResMut<PlaceRuntime>, beacons: Query<[Entity, Position], With<PlaceBeacon>>) {
		runtime.tick += 1;
		beacons.forEach((_entity, position) => {
			position.value = new Vector3(math.sin(runtime.tick / 30) * 8, 4, math.cos(runtime.tick / 30) * 8);
		});
	}
}

@system({ schedule: Update })
class CountPlayers {
	run(runtime: ResMut<PlaceRuntime>) {
		const [ok, players] = pcall(() => game.GetService("Players"));
		runtime.playersSeen = ok ? players.GetPlayers().size() : 0;
	}
}

@system({ schedule: Update })
class SendPlacePing {
	run(runtime: ResMut<PlaceRuntime>, network: NetClient) {
		if (runtime.tick % 60 !== 0) return;
		const [ok, players] = pcall(() => game.GetService("Players"));
		const localPlayer = ok ? players.LocalPlayer : undefined;
		runtime.clientPingsSent += 1;
		network.send(new PlacePingNet(runtime.id, localPlayer?.UserId ?? 0, runtime.tick));
	}
}

@system({ schedule: Update })
class ReceivePlacePings {
	run(pings: EventReader<PlacePingNet>, context: NetEventContext, runtime: ResMut<PlaceRuntime>) {
		pings.forEach((ping) => {
			const sender = context.senderOf(ping);
			runtime.serverPingsReceived += 1;
			runtime.lastClientUserId = sender?.UserId ?? ping.userId;
		});
	}
}

@system({ schedule: Update })
class BroadcastPlaceSnapshot {
	run(runtime: ResMut<PlaceRuntime>, network: NetServer) {
		if (runtime.tick % 30 !== 0) return;
		runtime.networkTick += 1;
		network.broadcast(
			new PlaceSnapshotNet(
				runtime.id,
				runtime.displayName,
				runtime.tick,
				runtime.playersSeen,
				runtime.serverPingsReceived,
			),
		);
	}
}

@system({ schedule: Update })
class ReceivePlaceSnapshot {
	run(snapshots: EventReader<PlaceSnapshotNet>, runtime: ResMut<PlaceRuntime>) {
		snapshots.forEach((snapshot) => {
			runtime.clientSnapshotsSeen += 1;
			runtime.lastSnapshotPlaceId = snapshot.placeId;
			runtime.networkTick = snapshot.serverTick;
			runtime.playersSeen = snapshot.playersSeen;
			runtime.serverPingsReceived = snapshot.pingsReceived;
		});
	}
}

export function configurePlace(app: App, place: PlaceDefinition) {
	const runtime = app.world.resource(PlaceRuntime);
	runtime.id = place.id;
	runtime.displayName = place.displayName;
	runtime.accent = place.accent;
	app.world.spawn(new PlaceBeacon(`${place.displayName} Beacon`, place.id), new Position(new Vector3(0, 4, 0)));
	return runtime;
}

export function makePlaceBanner(place: PlaceDefinition) {
	return `Rovy ${place.displayName} place loaded`;
}
