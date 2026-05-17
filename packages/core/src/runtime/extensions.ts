import type { App } from "./app";
import type { RovyRegistry } from "../contract";

export type AppExtension = (app: App, registry: RovyRegistry) => void;

const appExtensions = new Array<AppExtension>();

export function registerAppExtension(extension: AppExtension): void {
	appExtensions.push(extension);
}

export function runAppExtensions(app: App, registry: RovyRegistry): void {
	for (const extension of appExtensions) {
		extension(app, registry);
	}
}

export function resetAppExtensions(): void {
	while (appExtensions.size() > 0) appExtensions.pop();
}
