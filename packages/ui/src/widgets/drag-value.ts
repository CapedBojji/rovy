import { widget } from "../runtime";
import { slider } from "./slider";

export interface DragValueOptions {
	min?: number;
	max?: number;
	initial?: number;
	step?: number;
	label?: string;
}

/** @widget */
export const dragValue = widget((options: DragValueOptions = {}): number => {
	return slider({ min: options.min, max: options.max, initial: options.initial, label: options.label });
}, "@rovy/ui/dragValue");
