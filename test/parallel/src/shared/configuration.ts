import { Players, ReplicatedStorage, RunService, ServerScriptService } from "@rbxts/services";

// DataModel-root attributes are not serialized by Rojo; a Folder is explicit.
export const verification = ReplicatedStorage.WaitForChild("ParallelVerification");

/** Prove engine callback behavior, rather than trusting the configuration label. */
export function verifySignalMode() {
	const signal = new Instance("BindableEvent");
	let delivered = false;
	signal.Event.Connect(() => { delivered = true; });
	signal.Fire();
	const observed = delivered ? "Immediate" : "Deferred";
	signal.Destroy();
	assert(observed === verification.GetAttribute("ParallelSignalMode"), "engine signal mode differs from built fixture");
	return observed;
}

export function verifyPoolCleanup() {
	const parent = RunService.IsServer() ? ServerScriptService : Players.LocalPlayer.WaitForChild("PlayerScripts");
	assert(parent.FindFirstChild("RovyParallel") === undefined, "parallel pool folder leaked after destruction");
}
