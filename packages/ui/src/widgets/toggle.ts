import { widget, __useState } from "../runtime";
import { button } from "./button";

export interface ToggleOptions {
	on?: boolean;
	disabled?: boolean;
}
export interface ToggleHandle {
	on(): boolean;
	clicked(): boolean;
}

/** @widget */
export const toggle = widget((text: string, options: ToggleOptions = {}): ToggleHandle => {
	const [on, setOn] = __useState("toggle:on", options.on ?? false);
	const handle = button(`${on ? "ON" : "OFF"} ${text}`, { disabled: options.disabled });
	if (handle.clicked()) setOn((value) => !value);
	return {
		on() {
			return on;
		},
		clicked() {
			return handle.clicked();
		},
	};
}, "@rovy/ui/toggle");
