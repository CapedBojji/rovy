import { App, type Plugin } from "@rovy/core";
import { ToggleWorldInspector, WorldInspectorPlugin } from "@rovy/world-inspector";
import "./collectors";
import "./components";
import "./monitors";
import "./systems";

export * from "./state";
export * from "./resources";

import { FrameSet, InputSet, Render, RenderSet, SnapshotSet } from "./state";
import { ClientClock, HudState } from "./resources";

function createInspectorGui(): ScreenGui {
	const Players = game.GetService("Players");
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "RovyWorldInspector";
	gui.ResetOnSpawn = false;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	gui.DisplayOrder = 1000;
	gui.Parent = playerGui;
	return gui;
}

export function boot(): App {
	const app = new App();
	app.configureSets(Render, [FrameSet, SnapshotSet, InputSet, RenderSet]);
	app.addPlugin(new WorldInspectorPlugin({
		uiRoot: createInspectorGui(),
		renderSchedule: Render,
		networkSchedule: Render,
	}) as unknown as Plugin);
	app.start();
	return app;
}

export function setClockDelta(app: App, dt: number): void {
	app.world.resource(ClientClock).delta = dt;
}

export function readHudState(app: App): HudState {
	return app.world.resource(HudState);
}

export function toggleInspector(app: App): void {
	app.world.trigger(new ToggleWorldInspector());
}
