/**
 * Visual check surface. `runner.luau` drives the headless assertions; this runs
 * during a playtest so Rovy UI and the world inspector can actually be looked
 * at in Studio.
 */
import { Players, RunService } from "@rbxts/services";
import { App, component, schedule } from "@rovy/core";
import { Hud, hudState } from "../shared/hud";
import { ToggleWorldInspector, WorldInspectorPlugin } from "@rovy/world-inspector";

@schedule
class Render {}

@component
class Enemy {
	constructor(public name = "slime", public health = 10) {}
}

const player = Players.LocalPlayer;
const playerGui = player.WaitForChild("PlayerGui");

const hudRoot = new Instance("ScreenGui");
hudRoot.Name = "RovyVisualHud";
hudRoot.ResetOnSpawn = false;
hudRoot.Parent = playerGui;

const inspectorRoot = new Instance("ScreenGui");
inspectorRoot.Name = "RovyWorldInspector";
inspectorRoot.ResetOnSpawn = false;
inspectorRoot.Parent = playerGui;

const app = new App();
app.addPlugin(
	new WorldInspectorPlugin({
		uiRoot: inspectorRoot,
		renderSchedule: Render,
	}),
);
app.mount(Hud, hudRoot);
app.start();

// Give the inspector something to list.
app.commands.spawn(new Enemy("slime", 10));
app.commands.spawn(new Enemy("bat", 6));
app.commands.spawn(new Enemy("golem", 40));

hudState.inspectorOpen = true;
app.world.trigger(new ToggleWorldInspector());

RunService.RenderStepped.Connect((dt) => {
	hudState.frames += 1;
	app.runSchedule(Render, dt);
});

print("ROVY_VISUAL_READY");
