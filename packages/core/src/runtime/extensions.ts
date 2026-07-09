import type { App } from "./app";
import type { RovyRegistry } from "../contract";

export type AppExtension = (app: App, registry: RovyRegistry) => void;
export type PostStartAppExtension = (app: App, registry: RovyRegistry) => void;

const appExtensions = new Array<AppExtension>();
const postStartAppExtensions = new Array<PostStartAppExtension>();

export function registerAppExtension(extension: AppExtension): void {
	appExtensions.push(extension);
}

export function registerPostStartAppExtension(extension: PostStartAppExtension): void {
	postStartAppExtensions.push(extension);
}

export function runAppExtensions(app: App, registry: RovyRegistry): void {
	for (const extension of appExtensions) {
		extension(app, registry);
	}
}

export function runPostStartAppExtensions(app: App, registry: RovyRegistry): void {
	for (const extension of postStartAppExtensions) {
		extension(app, registry);
	}
}

export function resetAppExtensions(): void {
	while (appExtensions.size() > 0) appExtensions.pop();
	while (postStartAppExtensions.size() > 0) postStartAppExtensions.pop();
}
