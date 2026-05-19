import { widget, __useInstance, useContext } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim2 } from "../primitives";
import * as contexts from "../contexts";

export interface LabelOptions {
	textSize?: number;
	color?: Color3;
	wrapped?: boolean;
}

interface TableCellState {
	centered?: boolean;
}

/** @widget */
export const label = widget((text: string, options: LabelOptions = {}): void => {
	const refs = __useInstance("label:instance", (ref) =>
		create("TextLabel", {
			[ref as never]: "label",
			BackgroundTransparency: 1,
			Font: Enum.Font.Code,
			TextColor3: useStyle().textColor,
			TextSize: useStyle().textSize,
			TextXAlignment: Enum.TextXAlignment.Left,
			TextYAlignment: Enum.TextYAlignment.Center,
			TextTruncate: Enum.TextTruncate.AtEnd,
			RichText: false,
			Size: udim2(1, 0, 0, useStyle().itemHeight),
		}),
	) as { label: TextLabel };

	const style = useStyle();
	const lbl = refs.label;
	lbl.Text = text;
	lbl.TextSize = options.textSize ?? style.textSize;
	lbl.TextColor3 = options.color ?? style.textColor;

	const inScrollX = useContext(contexts.scrollX);
	const tableCellState = useContext(contexts.tableCellState) as TableCellState | undefined;

	if (tableCellState !== undefined && tableCellState.centered === true) {
		lbl.TextXAlignment = Enum.TextXAlignment.Center;
	} else {
		lbl.TextXAlignment = Enum.TextXAlignment.Left;
	}

	if (options.wrapped === true) {
		lbl.TextWrapped = true;
		lbl.TextTruncate = Enum.TextTruncate.None;
		lbl.AutomaticSize = Enum.AutomaticSize.Y;
		lbl.Size = udim2(1, 0, 0, 0);
	} else if (inScrollX === true) {
		lbl.TextWrapped = false;
		lbl.TextTruncate = Enum.TextTruncate.None;
		lbl.AutomaticSize = Enum.AutomaticSize.X;
		lbl.Size = udim2(0, 0, 0, style.itemHeight);
	} else {
		lbl.TextWrapped = false;
		lbl.TextTruncate = Enum.TextTruncate.AtEnd;
		lbl.AutomaticSize = Enum.AutomaticSize.None;
		lbl.Size = udim2(1, 0, 0, style.itemHeight);
	}
}, "@rovy/ui/label");
