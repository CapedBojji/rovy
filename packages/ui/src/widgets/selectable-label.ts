import { widget, __useInstance, __useState } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2 } from "../primitives";

export interface SelectableLabelOptions {
	selected?: boolean;
	disabled?: boolean;
}
export interface SelectableLabelHandle {
	selected(): boolean;
	clicked(): boolean;
}

/** @widget */
export const selectableLabel = widget((text: string, options: SelectableLabelOptions = {}): SelectableLabelHandle => {
	const [clicked, setClicked] = __useState("selectableLabel:clicked", false);
	const [hovered, setHovered] = __useState("selectableLabel:hovered", false);

	const refs = __useInstance("selectableLabel:instance", (ref) => {
		const style = useStyle();
		return create("TextButton", {
			[ref as never]: "btn",
			BackgroundColor3: style.selectableColor,
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
			Font: Enum.Font.Code,
			TextColor3: style.textColor,
			TextSize: style.textSize,
			Size: udim2(0, 0, 0, style.itemHeight),
			AutomaticSize: Enum.AutomaticSize.X,
			AutoButtonColor: false,
			0: create("UICorner", { CornerRadius: udim(0, style.cornerRadius) }),
			1: create("UIPadding", {
				PaddingLeft: udim(0, 6),
				PaddingRight: udim(0, 6),
			}),
			MouseEnter: () => {
				setHovered(true);
			},
			MouseLeave: () => {
				setHovered(false);
			},
			Activated: () => {
				if (options.disabled !== true) {
					setClicked(true);
				}
			},
		});
	}) as { btn: TextButton };

	const style = useStyle();
	const isSelected = options.selected ?? false;

	refs.btn.Text = text;
	refs.btn.TextSize = style.textSize;

	if (options.disabled === true) {
		refs.btn.BackgroundTransparency = 1;
		refs.btn.TextColor3 = style.textDisabledColor;
	} else if (isSelected) {
		refs.btn.BackgroundColor3 = style.selectionBgColor;
		refs.btn.BackgroundTransparency = 0;
		refs.btn.TextColor3 = style.strongTextColor;
	} else if (hovered) {
		refs.btn.BackgroundColor3 = style.widgetHoveredBgColor;
		refs.btn.BackgroundTransparency = 0;
		refs.btn.TextColor3 = style.strongTextColor;
	} else {
		refs.btn.BackgroundTransparency = 1;
		refs.btn.TextColor3 = style.textColor;
	}

	return {
		selected() {
			return isSelected;
		},
		clicked() {
			if (clicked) {
				setClicked(false);
				return true;
			}
			return false;
		},
	};
}, "@rovy/ui/selectableLabel");
