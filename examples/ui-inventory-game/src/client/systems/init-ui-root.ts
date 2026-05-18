import { ResMut, system } from "@rovy/core";
import RovyUi from "@rovy/ui";
import { InventoryUiRoot } from "../resources";
import { Startup, UiStartupSet } from "../state";

function createGui(): ScreenGui {
	const Players = game.GetService("Players");
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "RovyUiInventoryExample";
	gui.ResetOnSpawn = false;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	gui.Parent = playerGui;
	return gui;
}

@system({ schedule: Startup, set: UiStartupSet })
export class InitUiRoot {
	run(ui: ResMut<InventoryUiRoot>) {
		if (ui.root !== undefined && ui.gui?.Parent !== undefined) return;

		const gui = createGui();
		ui.gui = gui;
		ui.root = RovyUi.new(gui);
	}
}
