import { App } from "@rovy/core";
import "./collectors";
import "./components";
import "./systems";

export * from "./state";
export * from "./resources";

import { FrameSet, InputSet, Render, RenderSet, SnapshotSet } from "./state";
import { ClientClock, HudState } from "./resources";

export function boot(): App {
	const app = new App();
	app.configureSets(Render, [FrameSet, SnapshotSet, InputSet, RenderSet]);
	app.start();
	return app;
}

export function setClockDelta(app: App, dt: number): void {
	app.world.resource(ClientClock).delta = dt;
}

export function readHudState(app: App): HudState {
	return app.world.resource(HudState);
}
