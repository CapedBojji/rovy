import { widget } from "../runtime";
import { button } from "./button";

export interface SelectableLabelOptions {
	selected?: boolean;
	disabled?: boolean;
}
export interface SelectableLabelHandle {
	selected(): boolean;
	clicked(): boolean;
}

/** @widget */
export const selectableLabel = widget((text: string, options: SelectableLabelOptions = {}): SelectableLabelHandle => {
	const handle = button(text, { disabled: options.disabled });
	return {
		selected() {
			return options.selected ?? false;
		},
		clicked() {
			return handle.clicked();
		},
	};
}, "@rovy/ui/selectableLabel");
