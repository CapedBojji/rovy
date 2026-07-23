import type { App, Commands } from "@rovy/core";
import type { BlinkModule } from "./transport-blink";
import type { NetTransport } from "./transport";
import type { NetEventReg, NetFunctionReg, RuntimeBoundary } from "./types";

export interface BoundaryPluginDelegate {
	readonly runtime: object;
	readonly transport: NetTransport;
	readonly manualStep?: (commands: Commands) => void;
	build(app: App): void;
}

export interface NetBoundaryProvider {
	readonly boundary: "client" | "server";
	createRuntime(events?: ReadonlyArray<NetEventReg>, functions?: ReadonlyArray<NetFunctionReg>): object;
	createPlugin(options: object): BoundaryPluginDelegate;
	createRemoteTransport(): NetTransport;
	createBlinkTransport(
		module: BlinkModule,
		events: ReadonlyArray<NetEventReg>,
		functions: ReadonlyArray<NetFunctionReg>,
	): NetTransport;
}

let activeProvider: NetBoundaryProvider | undefined;

export function registerNetBoundaryProvider(provider: NetBoundaryProvider): true {
	activeProvider = provider;
	return true;
}

export function detectRuntimeBoundary(override?: RuntimeBoundary): RuntimeBoundary {
	if (override !== undefined && override !== "unknown") return override;
	const [ok, runService] = pcall(() => game.GetService("RunService"));
	if (!ok || runService === undefined) return "unknown";
	if (runService.IsServer()) return "server";
	if (runService.IsClient()) return "client";
	return "unknown";
}

export function requireNetBoundaryProvider(override?: RuntimeBoundary): NetBoundaryProvider {
	const expected = detectRuntimeBoundary(override);
	const provider = activeProvider;
	assert(
		provider !== undefined,
		"[rovy-net] no client or server networking runtime is loaded; require the generated plugin facade from a Roblox runtime boundary",
	);
	assert(
		expected === "unknown" || provider.boundary === expected,
		`[rovy-net] ${expected} networking was requested, but only the ${provider.boundary} boundary is loaded`,
	);
	return provider;
}
