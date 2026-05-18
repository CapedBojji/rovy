import { widget } from "../runtime";
import { label } from "./label";

export interface ProgressBarOptions {
	value: number;
	label?: string;
}

/** @widget */
export const progressBar = widget((options: ProgressBarOptions): void => {
	label(`${options.label ?? "Progress"} ${math.floor(options.value * 100)}%`);
}, "@rovy/ui/progressBar");
