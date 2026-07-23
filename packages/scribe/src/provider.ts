import type { App } from "@rovy/core";
import type {
	ScribePluginOptions,
} from "./plugin";
import type { ScribeRuntime, ScribeRuntimeBoundary } from "./runtime";

export interface ScribeBoundaryPluginDelegate {
	readonly boundary: ScribeRuntimeBoundary;
	readonly runtime?: ScribeRuntime;
	build(app: App): void;
}

export interface ScribeBoundaryProvider {
	readonly boundary: ScribeRuntimeBoundary;
	createPlugin(options: ScribePluginOptions): ScribeBoundaryPluginDelegate;
}

let activeProvider: ScribeBoundaryProvider | undefined;

export function registerScribeBoundaryProvider(
	provider: ScribeBoundaryProvider,
): true {
	activeProvider = provider;
	return true;
}

export function detectScribeRuntimeBoundary(): ScribeRuntimeBoundary | "unknown" {
	const [ok, runService] = pcall(() => game.GetService("RunService"));
	if (!ok || runService === undefined) return "unknown";
	if (runService.IsServer()) return "server";
	if (runService.IsClient()) return "client";
	return "unknown";
}

export function requireScribeBoundaryProvider(): ScribeBoundaryProvider {
	const provider = activeProvider;
	assert(
		provider !== undefined,
		"[rovy/scribe] no client or server runtime is loaded; require the generated plugin facade from a Roblox runtime boundary",
	);
	const detected = detectScribeRuntimeBoundary();
	assert(
		detected === "unknown" || detected === provider.boundary,
		`[rovy/scribe] ${detected} runtime detected, but only the ${provider.boundary} Scribe boundary is loaded`,
	);
	return provider;
}

export function isActiveScribeBoundary(
	boundary: ScribeRuntimeBoundary,
): boolean {
	return activeProvider?.boundary === boundary;
}
