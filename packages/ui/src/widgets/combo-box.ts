import { widget, __useState } from "../runtime";
import { label } from "./label";

export interface ComboBoxOptions {
	items: string[];
	selected?: string;
	label?: string;
}
export interface ComboBoxHandle {
	value(): string;
	changed(): boolean;
}

/** @widget */
export const comboBox = widget((options: ComboBoxOptions): ComboBoxHandle => {
	const [value] = __useState("combo:value", options.selected ?? options.items[0] ?? "");
	label(`${options.label ?? "Combo"}: ${value}`);
	return {
		value() {
			return value;
		},
		changed() {
			return false;
		},
	};
}, "@rovy/ui/comboBox");
