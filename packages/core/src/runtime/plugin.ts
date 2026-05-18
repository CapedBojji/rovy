import type { App } from "./app";

export interface Plugin {
	build(app: App): void;
}
