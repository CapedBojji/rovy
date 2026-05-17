import { resource } from "@rovy/core";

function loadNetworkModule() {
	const rs = game.GetService("ReplicatedStorage").WaitForChild("TS");
	const module = rs.WaitForChild("network") as ModuleScript;
	return require(module) as typeof import("shared/network");
}

type GlobalClient = ReturnType<(typeof import("shared/network"))["GlobalEvents"]["createClient"]>;

let globalClient: GlobalClient | undefined;

export function getGlobalClient(): GlobalClient {
	if (globalClient !== undefined) return globalClient;
	const network = loadNetworkModule();
	globalClient = network.GlobalEvents.createClient({});
	return globalClient;
}

@resource
export class ClientNetworkState {
	readonly events?: GlobalClient;

	constructor() {
		const [ok, client] = pcall(getGlobalClient);
		if (!ok) return;
		this.events = client;
	}
}
