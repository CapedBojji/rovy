import { widget } from "../runtime";
import { button } from "./button";

export interface ClickableLabelOptions {
	textSize?: number;
	color?: Color3;
}
export interface ClickableLabelHandle {
	clicked(): boolean;
}

/** @widget */
export const clickableLabel = widget((text: string, options: ClickableLabelOptions = {}): ClickableLabelHandle => {
	return button(text, { disabled: false });
}, "@rovy/ui/clickableLabel");
