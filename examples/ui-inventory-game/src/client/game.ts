import { App } from "@rovy/core";
import "./systems";

export * from "./state";
export * from "./resources";

import { InventoryCatalog, InventoryUiRoot, UiDiagnostics } from "./resources";
import { Render, Startup, UiRenderSet, UiStartupSet } from "./state";

export interface UiSmokeResult {
	readonly rootReady: boolean;
	readonly guiReady: boolean;
	readonly renderCount: number;
	readonly demoRendered: boolean;
	readonly inventoryRendered: boolean;
	readonly itemCount: number;
}

export function boot(): App {
	const app = new App();
	app.configureSets(Startup, [UiStartupSet]);
	app.configureSets(Render, [UiRenderSet]);
	app.start();
	app.runSchedule(Startup);
	return app;
}

export function runUiSmoke(): UiSmokeResult {
	const app = boot();
	app.runSchedule(Render);

	const ui = app.world.resource(InventoryUiRoot);
	const diagnostics = app.world.resource(UiDiagnostics);
	const inventory = app.world.resource(InventoryCatalog);

	return {
		rootReady: ui.root !== undefined,
		guiReady: ui.gui !== undefined,
		renderCount: diagnostics.renderCount,
		demoRendered: diagnostics.demoRendered,
		inventoryRendered: diagnostics.inventoryRendered,
		itemCount: inventory.items.size(),
	};
}
