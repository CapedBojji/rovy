import { App, resource } from "@rovy/core";

@resource
export class TemplateBootstrap {}

export interface TemplateSmokeResult {
	readonly started: boolean;
}

export function bootTemplateApp(): App {
	const app = new App();
	app.start();
	return app;
}

export function runTemplateSmoke(): TemplateSmokeResult {
	const app = bootTemplateApp();
	return {
		started: app.isStarted(),
	};
}
