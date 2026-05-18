import { widget, __useInstance } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { textProps } from "./shared";

export interface LabelOptions {
	textSize?: number;
	color?: Color3;
	wrapped?: boolean;
}

/** @widget */
export const label = widget((text: string, options: LabelOptions = {}): void => {
	const refs = __useInstance("label:instance", (ref) =>
		create("TextLabel", { [ref as never]: "label", ...textProps(text, useStyle()) }),
	) as {
		label: TextLabel;
	};
	refs.label.Text = text;
	refs.label.TextSize = options.textSize ?? useStyle().textSize;
	refs.label.TextColor3 = options.color ?? useStyle().textColor;
	refs.label.TextWrapped = options.wrapped ?? false;
}, "@rovy/ui/label");
