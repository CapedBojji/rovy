import { resource } from "@rovy/core";

function loadNetworkModule() {
	const rs = game.GetService("ReplicatedStorage").WaitForChild("TS");
	const module = rs.WaitForChild("network") as ModuleScript;
	return require(module) as typeof import("shared/network");
}

type GlobalServer = ReturnType<(typeof import("shared/network"))["GlobalEvents"]["createServer"]>;

let globalServer: GlobalServer | undefined;

export function getGlobalServer(): GlobalServer {
	if (globalServer !== undefined) return globalServer;
	const network = loadNetworkModule();
	globalServer = network.GlobalEvents.createServer({});
	return globalServer;
}

@resource
export class ServerNetworkState {
	readonly events?: GlobalServer;

	constructor() {
		const [ok, server] = pcall(getGlobalServer);
		if (!ok) return;
		this.events = server;
	}
}
