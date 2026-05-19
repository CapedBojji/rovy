import { widget, __useInstance } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim2 } from "../primitives";

export interface HeadingOptions {
	textSize?: number;
	font?: CastsToEnum<Enum.Font>;
}

/** @widget */
export const heading = widget((text: string, options: HeadingOptions = {}): void => {
	const refs = __useInstance("heading:instance", (ref) => {
		const style = useStyle();
		return create("TextLabel", {
			[ref as never]: "heading",
			BackgroundTransparency: 1,
			Font: Enum.Font.GothamBold,
			TextColor3: style.textColor,
			TextSize: (style.textSize ?? 13) + 2,
			TextXAlignment: Enum.TextXAlignment.Left,
			TextYAlignment: Enum.TextYAlignment.Center,
			TextTruncate: Enum.TextTruncate.AtEnd,
			Size: udim2(1, 0, 0, (style.itemHeight ?? 22) + 2),
		});
	}) as { heading: TextLabel };

	const style = useStyle();
	const lbl = refs.heading;
	lbl.Text = text;
	lbl.TextSize = options.textSize ?? style.textSize + 2;
	lbl.Font = (options.font ?? Enum.Font.GothamBold) as Enum.Font;
}, "@rovy/ui/heading");
