import { App } from "@rovy/core";
import { DataStorePlugin } from "@rovy/datastore";
import { CoinsLabel, FieldLabel, SavedLabel, ScribeCoinsLabel, renderCounts, resetRenderCounts } from "./ui";
import { DriveDocument, observed, queueAction } from "./systems";
import { Tick } from "./schedules";
import { Hud, hudState } from "./hud";

export interface CaseResult {
	readonly name: string;
	readonly ok: boolean;
	readonly detail: string;
}

/**
 * `@rovy/ui` flushes rerenders through `task.defer`, so every assertion has to
 * let the deferred queue drain before reading a render count.
 */
function settle(): void {
	task.wait();
	task.wait();
}

/** Prints the built Instance tree so the shape is reviewable from the log. */
function describe(instance: Instance, depth: number): string {
	const pad = string.rep("  ", depth);
	let out = `\n${pad}${instance.ClassName} "${instance.Name}"`;
	if (instance.IsA("TextLabel")) out += ` text="${instance.Text}"`;
	if (instance.IsA("GuiObject")) out += ` size=${tostring(instance.Size)}`;
	for (const child of instance.GetChildren()) out += describe(child, depth + 1);
	return out;
}

/** Bumped by hand; the runner prints it so a stale build is obvious. */
export const HARNESS_REVISION = "scribe-rerender-1";

export function runIntegrationTests(): Array<CaseResult> {
	const results = new Array<CaseResult>();
	const record = (name: string, ok: boolean, detail: string): void => {
		results.push({ name, ok, detail });
	};

	// Keep the registered system referenced so the import is not elided.
	assert(DriveDocument !== undefined, "DriveDocument must be registered");

	const screen = new Instance("ScreenGui");
	screen.Name = "RovyIntegrationUi";
	screen.Parent = game.GetService("ReplicatedStorage");

	resetRenderCounts();

	const app = new App();
	app.addPlugin(new DataStorePlugin({ mock: true }));
	// app.mount(...) queues the mount; @rovy/ui consumes it after start().
	app.mount(CoinsLabel, screen);
	app.mount(SavedLabel, screen);
	app.mount(FieldLabel, screen);
	app.mount(ScribeCoinsLabel, screen);
	app.start();
	settle();

	const mountedCoins = renderCounts.documentChanged;
	const mountedSaved = renderCounts.documentSaved;
	record(
		"ui mounts against a real DataModel",
		mountedCoins >= 1 && mountedSaved >= 1 && screen.FindFirstChild("CoinsLabel") !== undefined,
		`coins=${mountedCoins} saved=${mountedSaved} instance=${tostring(screen.FindFirstChild("CoinsLabel") !== undefined)}`,
	);

	queueAction("open");
	app.runSchedule(Tick);
	settle();

	// Opening is asynchronous through the adapter; give it a schedule turn.
	app.runSchedule(Tick);
	settle();
	record("keyed document opens", observed.coins === 0, `coins=${observed.coins}`);

	const beforeChange = renderCounts.documentChanged;
	queueAction("addCoins");
	app.runSchedule(Tick);
	settle();
	record(
		"ui rerenders on DocumentChanged",
		renderCounts.documentChanged > beforeChange,
		`before=${beforeChange} after=${renderCounts.documentChanged} coins=${observed.coins}`,
	);

	const beforeSave = renderCounts.documentSaved;
	queueAction("save");
	app.runSchedule(Tick);
	settle();
	app.runSchedule(Tick);
	settle();
	record(
		"ui rerenders on DocumentSaved",
		renderCounts.documentSaved > beforeSave,
		`before=${beforeSave} after=${renderCounts.documentSaved}`,
	);

	queueAction("openShared");
	app.runSchedule(Tick);
	settle();
	app.runSchedule(Tick);
	settle();
	record(
		"shared document opens with a string key",
		observed.sharedKey === "live" && observed.sharedSeason === "alpha",
		`key=${observed.sharedKey} season=${observed.sharedSeason}`,
	);

	const beforeClassEvent = renderCounts.classEvent;
	queueAction("sendFieldChanged");
	app.runSchedule(Tick);
	settle();
	record(
		"ui rerenders on a class-constructor event (the @rovy/scribe branch)",
		renderCounts.classEvent > beforeClassEvent,
		`before=${beforeClassEvent} after=${renderCounts.classEvent}`,
	);

	// The playtest client shows this same component; building it here proves
	// the tree it produces without needing a Player or a camera.
	hudState.frames = 42;
	hudState.inspectorOpen = true;
	const hudScreen = new Instance("ScreenGui");
	hudScreen.Name = "RovyHudProbe";
	hudScreen.Parent = game.GetService("ReplicatedStorage");

	const hudApp = new App();
	hudApp.mount(Hud, hudScreen);
	hudApp.start();
	settle();

	const panel = hudScreen.FindFirstChild("HudPanel") as Frame | undefined;
	const title = panel?.FindFirstChild("Title") as TextLabel | undefined;
	const framesLabel = panel?.FindFirstChild("Frames") as TextLabel | undefined;
	const hint = panel?.FindFirstChild("Hint") as TextLabel | undefined;
	record(
		"hud builds a styled panel with layout children",
		panel !== undefined &&
			panel.Size === UDim2.fromOffset(280, 96) &&
			panel.FindFirstChildOfClass("UICorner") !== undefined &&
			panel.FindFirstChildOfClass("UIListLayout") !== undefined &&
			panel.FindFirstChildOfClass("UIPadding") !== undefined,
		panel === undefined ? "no HudPanel" : `size=${tostring(panel.Size)} children=${panel.GetChildren().size()}`,
	);
	record(
		"hud labels render live state",
		title?.Text === "Rovy UI" &&
			framesLabel?.Text === "rendered frames: 42" &&
			hint?.Text === "world inspector: open",
		`title=${title?.Text ?? "nil"} frames=${framesLabel?.Text ?? "nil"} hint=${hint?.Text ?? "nil"}`,
	);
	print("ROVY_VISUAL_TREE " + describe(hudScreen, 0));
	hudScreen.Destroy();

	const beforeScribe = renderCounts.scribeEvent;
	queueAction("sendScribeChanged");
	app.runSchedule(Tick);
	settle();
	record(
		"ui rerenders on a @scribeEvent bound in static rerender",
		renderCounts.scribeEvent > beforeScribe,
		`before=${beforeScribe} after=${renderCounts.scribeEvent}`,
	);

	const changedLabel = screen.FindFirstChild("CoinsLabel") as TextLabel | undefined;
	record(
		"rerender patched the live Instance",
		changedLabel !== undefined && string.find(changedLabel.Text, "renders=")[0] !== undefined,
		changedLabel === undefined ? "missing CoinsLabel" : changedLabel.Text,
	);

	screen.Destroy();
	return results;
}
