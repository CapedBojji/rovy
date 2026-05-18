import { widget } from "../runtime";
import { v2 } from "../primitives";
import { window } from "./window";

export interface PopupOptions {
	open?: boolean;
	position?: Vector2;
}

/** @widget */
export const popup = widget((options: PopupOptions, children: () => void): void => {
	if (options.open === false) return;
	window({ title: "Popup", position: options.position, size: v2(220, 120) }, children);
}, "@rovy/ui/popup");
