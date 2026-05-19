import { widget, __useInstance, __useState } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2, v2 } from "../primitives";

export interface RadioButtonOptions {
	selected?: boolean;
	disabled?: boolean;
}
export interface RadioButtonHandle {
	selected(): boolean;
	clicked(): boolean;
}

/** @widget */
export const radioButton = widget((text: string, options: RadioButtonOptions = {}): RadioButtonHandle => {
	const [clicked, setClicked] = __useState("radioButton:clicked", false);
	const [hovered, setHovered] = __useState("radioButton:hovered", false);

	const refs = __useInstance("radioButton:instance", (ref) => {
		const style = useStyle();
		const circleSize = style.itemHeight - 6;
		return create("Frame", {
			[ref as never]: "row",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, style.itemHeight),
			0: create("TextButton", {
				[ref as never]: "circle",
				BackgroundColor3: style.frameBgColor,
				BackgroundTransparency: style.frameBgTransparency,
				BorderSizePixel: 0,
				Size: udim2(0, circleSize, 0, circleSize),
				AnchorPoint: v2(0, 0.5),
				Position: udim2(0, 0, 0.5, 0),
				Text: "",
				AutoButtonColor: false,
				0: create("UICorner", { CornerRadius: udim(1, 0) }),
				1: create("UIStroke", {
					[ref as never]: "stroke",
					Color: style.borderColor,
					Transparency: style.borderTransparency,
					Thickness: 1,
				}),
				2: create("Frame", {
					[ref as never]: "dot",
					BackgroundColor3: style.checkMarkColor,
					BackgroundTransparency: 1,
					BorderSizePixel: 0,
					Size: udim2(0.5, 0, 0.5, 0),
					AnchorPoint: v2(0.5, 0.5),
					Position: udim2(0.5, 0, 0.5, 0),
					0: create("UICorner", { CornerRadius: udim(1, 0) }),
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
			}),
			1: create("TextLabel", {
				[ref as never]: "label",
				BackgroundTransparency: 1,
				Font: Enum.Font.Code,
				TextColor3: style.textColor,
				TextSize: style.textSize,
				TextXAlignment: Enum.TextXAlignment.Left,
				TextYAlignment: Enum.TextYAlignment.Center,
				Size: udim2(1, -(style.itemHeight - 6 + 6), 1, 0),
				Position: udim2(0, style.itemHeight - 6 + 6, 0, 0),
			}),
		});
	}) as { row: Frame; circle: TextButton; stroke: UIStroke; dot: Frame; label: TextLabel };

	const style = useStyle();
	const isSelected = options.selected ?? false;

	refs.dot.BackgroundTransparency = isSelected ? 0 : 1;
	refs.dot.BackgroundColor3 = style.checkMarkColor;

	if (options.disabled === true) {
		refs.circle.BackgroundTransparency = 0.7;
		refs.label.TextColor3 = style.textDisabledColor;
	} else if (hovered) {
		refs.circle.BackgroundColor3 = style.frameBgHoveredColor;
		refs.circle.BackgroundTransparency = style.frameBgHoveredTransparency;
		refs.label.TextColor3 = style.textColor;
	} else {
		refs.circle.BackgroundColor3 = style.frameBgColor;
		refs.circle.BackgroundTransparency = style.frameBgTransparency;
		refs.label.TextColor3 = style.textColor;
	}

	refs.label.Text = text;

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
}, "@rovy/ui/radioButton");
