import RovyUi, { demoWindow } from "@rovy/ui";
import { UI_TEST_PLACE_NAME } from "shared/info";

function createGui(): ScreenGui {
	const Players = game.GetService("Players");
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "RovyUiTestPlace";
	gui.ResetOnSpawn = false;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	gui.Parent = playerGui;
	return gui;
}

const root = RovyUi.new(createGui());
const RunService = game.GetService("RunService");

RunService.RenderStepped.Connect(() => {
	RovyUi.start(root, () => {
		demoWindow();
	});
});

print(`[${UI_TEST_PLACE_NAME}] client UI online`);
