import { App, rovy, type Plugin } from "@rovy/core";
import { WorldInspectorServerPlugin } from "@rovy/world-inspector";
import { ArenaPlace, Update, configurePlace, makePlaceBanner } from "shared/place-game";

rovy.loadPaths("projects/shared/src");

const app = new App();
const status = configurePlace(app, ArenaPlace);
app.addPlugin(new WorldInspectorServerPlugin({ schedule: Update }) as unknown as Plugin);
app.start();

print(`${makePlaceBanner(ArenaPlace)} (${status.id})`);

game.GetService("RunService").Heartbeat.Connect(() => {
	app.runSchedule(Update);
});
