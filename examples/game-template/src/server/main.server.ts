import { App } from "@rovy/core";
import { bootTemplateApp } from "shared/bootstrap";

export { runTemplateSmoke, type TemplateSmokeResult } from "shared/bootstrap";

export function bootServer(): App {
	return bootTemplateApp();
}

const serverApp = bootServer();
print(`[game-template] server bootstrap started: ${serverApp.isStarted()}`);
