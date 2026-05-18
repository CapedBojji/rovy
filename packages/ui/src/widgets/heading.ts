import { widget } from "../runtime";
import { useStyle } from "../style";
import { label } from "./label";

export interface HeadingOptions {
	textSize?: number;
	font?: CastsToEnum<Enum.Font>;
}

/** @widget */
export const heading = widget((text: string, options: HeadingOptions = {}): void => {
	label(text, { textSize: options.textSize ?? useStyle().textSize + 3 });
}, "@rovy/ui/heading");
