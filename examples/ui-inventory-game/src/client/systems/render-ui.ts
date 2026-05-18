import { Res, ResMut, system } from "@rovy/core";
import RovyUi, { demoWindow } from "@rovy/ui";
import { InventoryCatalog, InventoryUiRoot, UiDiagnostics } from "../resources";
import { UiRenderSet, Render } from "../state";
import { InventoryWindow } from "../widgets/inventory-window";

@system({ schedule: Render, set: UiRenderSet })
export class RenderUi {
	run(ui: Res<InventoryUiRoot>, inventory: Res<InventoryCatalog>, diagnostics: ResMut<UiDiagnostics>) {
		if (ui.root === undefined) return;

		RovyUi.start(ui.root, () => {
			demoWindow();
			InventoryWindow(inventory.items);
		});

		diagnostics.renderCount += 1;
		diagnostics.demoRendered = true;
		diagnostics.inventoryRendered = true;
	}
}
