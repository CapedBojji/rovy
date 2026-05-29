import { App } from "@rovy/core";
import { bootTemplateApp } from "shared/bootstrap";

export function bootClient(): App {
	return bootTemplateApp();
}

bootClient();
