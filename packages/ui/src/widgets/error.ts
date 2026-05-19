import { widget, __useInstance } from "../runtime";
import { create } from "../create";
import { c, udim, udim2 } from "../primitives";

/** @widget */
export const errorWidget = widget((errorText: string): void => {
	const refs = __useInstance("error:instance", (ref) =>
		create("TextLabel", {
			[ref as never]: "label",
			Visible: true,
			BackgroundColor3: c(80, 20, 20),
			BackgroundTransparency: 0,
			BorderSizePixel: 0,
			Font: Enum.Font.Code,
			TextColor3: c(255, 100, 100),
			TextSize: 12,
			TextWrapped: true,
			TextXAlignment: Enum.TextXAlignment.Left,
			Size: udim2(1, 0, 0, 40),
			0: create("UIPadding", {
				PaddingLeft: udim(0, 4),
				PaddingRight: udim(0, 4),
				PaddingTop: udim(0, 4),
				PaddingBottom: udim(0, 4),
			}),
		}),
	) as { label: TextLabel };

	refs.label.Visible = true;
	refs.label.Text = errorText;
}, "@rovy/ui/error");
