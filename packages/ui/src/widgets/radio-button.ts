import { widget } from "../runtime";
import { checkbox } from "./checkbox";

export interface RadioButtonOptions {
	selected?: boolean;
	disabled?: boolean;
}
export interface RadioButtonHandle {
	selected(): boolean;
	clicked(): boolean;
}

/** @widget */
export const radioButton = widget((text: string, options: RadioButtonOptions = {}): RadioButtonHandle => {
	const handle = checkbox(text, { checked: options.selected, disabled: options.disabled });
	return {
		selected() {
			return handle.checked();
		},
		clicked() {
			return handle.clicked();
		},
	};
}, "@rovy/ui/radioButton");
