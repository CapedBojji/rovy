/**
 * Flamework typed networking declarations.
 *
 * Only the buffer/byte-shaped remotes the gameplay loop needs — everything
 * substantive is encoded by the shared serializer in `contracts.ts`. The
 * server and client realms each import these to attach their own send/recv
 * handlers; no simulation lives here.
 */

import { Networking } from "@flamework/networking";

interface ClientToServerEvents {
	/** Client requests the server to fire the weapon this tick. */
	fireWeapon(bytes: buffer): void;

	/** Client requests a restart while the round is in `defeat`. */
	requestRestart(bytes: buffer): void;
}

interface ServerToClientEvents {
	/** Broadcast latest serialized `WorldSnapshotPayload`. */
	worldSnapshot(bytes: buffer): void;
}

interface ClientToServerFunctions {}

interface ServerToClientFunctions {}

export const GlobalEvents = Networking.createEvent<ClientToServerEvents, ServerToClientEvents>();
export const GlobalFunctions = Networking.createFunction<ClientToServerFunctions, ServerToClientFunctions>();
