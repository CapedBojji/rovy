import { App, rovy, type Plugin } from "@rovy/core";
import { ToggleWorldInspector, WorldInspectorPlugin } from "@rovy/world-inspector";
import { ArenaPlace, Update, configurePlace, makePlaceBanner } from "shared/place-game";

print(makePlaceBanner(ArenaPlace));

rovy.loadPaths("projects/shared/src");

function createInspectorGui(): ScreenGui {
	const playerGui = game.GetService("Players").LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "RovyMultiplaceInspector";
	gui.ResetOnSpawn = false;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	gui.DisplayOrder = 1000;
	gui.Parent = playerGui;
	return gui;
}

const app = new App();
configurePlace(app, ArenaPlace);
app.addPlugin(new WorldInspectorPlugin({
	uiRoot: createInspectorGui(),
	renderSchedule: Update,
	networkSchedule: Update,
}) as unknown as Plugin);
app.start();

game.GetService("UserInputService").InputBegan.Connect((input, processed) => {
	if (!processed && input.KeyCode === Enum.KeyCode.F2) {
		app.world.trigger(new ToggleWorldInspector());
	}
});

game.GetService("RunService").Heartbeat.Connect(() => {
	app.runSchedule(Update);
});
