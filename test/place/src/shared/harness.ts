import { App } from "@rovy/core";
import { DataStorePlugin } from "@rovy/datastore";
import { CoinsLabel, FieldLabel, SavedLabel, renderCounts, resetRenderCounts } from "./ui";
import { DriveDocument, observed, queueAction } from "./systems";
import { Tick } from "./schedules";

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

	const changedLabel = screen.FindFirstChild("CoinsLabel") as TextLabel | undefined;
	record(
		"rerender patched the live Instance",
		changedLabel !== undefined && string.find(changedLabel.Text, "renders=")[0] !== undefined,
		changedLabel === undefined ? "missing CoinsLabel" : changedLabel.Text,
	);

	screen.Destroy();
	return results;
}
