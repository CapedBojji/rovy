import { widget, __useState } from "../runtime";
import { label } from "./label";

export interface SliderOptions {
	min?: number;
	max?: number;
	initial?: number;
	label?: string;
	width?: number;
}

/** @widget */
export const slider = widget((options: SliderOptions | number = {}): number => {
	const opts = typeIs(options, "number") ? ({ initial: options } as SliderOptions) : options;
	const [value] = __useState("slider:value", opts.initial ?? opts.min ?? 0);
	label(`${opts.label ?? "Slider"}: ${value}`);
	return value;
}, "@rovy/ui/slider");
