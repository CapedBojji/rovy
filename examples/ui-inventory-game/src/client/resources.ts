import { resource } from "@rovy/core";
import RovyUi from "@rovy/ui";
import { STARTER_ITEMS, type InventoryItem } from "shared/inventory";

@resource
export class InventoryUiRoot {
	gui?: ScreenGui;
	root?: ReturnType<typeof RovyUi.new>;
}

@resource
export class InventoryCatalog {
	readonly items: ReadonlyArray<InventoryItem> = STARTER_ITEMS.map((item) => ({ ...item }));
}

@resource
export class UiDiagnostics {
	renderCount = 0;
	demoRendered = false;
	inventoryRendered = false;
}
