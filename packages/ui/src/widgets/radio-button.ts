import { widget, __useInstance, __useState, useHoverTarget } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2, v2 } from "../primitives";
import { applyStrokeState, isTopGuiTarget, type InteractState } from "./shared";

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
		const targetRef = ref as unknown as { circle: TextButton };
		const circleSize = style.itemHeight - 6;
		return create("Frame", {
			[ref as never]: "row",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, style.itemHeight),
			0: create("TextButton", {
				[ref as never]: "circle",
				BackgroundColor3: style.widgetInactiveBgColor,
				BackgroundTransparency: 0,
				BorderSizePixel: 0,
				Size: udim2(0, circleSize, 0, circleSize),
				AnchorPoint: v2(0, 0.5),
				Position: udim2(0, 0, 0.5, 0),
				Text: "",
				AutoButtonColor: false,
				0: create("UICorner", { CornerRadius: udim(1, 0) }),
				1: create("UIStroke", {
					[ref as never]: "stroke",
					Color: style.strokeInactiveColor,
					Transparency: style.strokeInactiveTransparency,
					Thickness: style.strokeThickness, ApplyStrokeMode: Enum.ApplyStrokeMode.Border,
				}),
				2: create("Frame", {
					[ref as never]: "dot",
					BackgroundColor3: style.accentColor,
					BackgroundTransparency: 1,
					BorderSizePixel: 0,
					Size: udim2(0.5, 0, 0.5, 0),
					AnchorPoint: v2(0.5, 0.5),
					Position: udim2(0.5, 0, 0.5, 0),
					0: create("UICorner", { CornerRadius: udim(1, 0) }),
					}),
					Activated: () => {
						if (options.disabled === true || !isTopGuiTarget(targetRef.circle)) return;
						setClicked(true);
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

	useHoverTarget(refs.circle, setHovered, `RadioButton: ${text}`);

	const style = useStyle();
	const isSelected = options.selected ?? false;

	refs.dot.BackgroundTransparency = isSelected ? 0 : 1;
	refs.dot.BackgroundColor3 = style.accentColor;

	let state: InteractState = "inactive";
	if (options.disabled === true) state = "disabled";
	else if (hovered) state = "hovered";

	if (state === "disabled") {
		refs.circle.BackgroundColor3 = style.widgetInactiveBgColor;
		refs.circle.BackgroundTransparency = 0.5;
		refs.label.TextColor3 = style.textDisabledColor;
	} else if (state === "hovered") {
		refs.circle.BackgroundColor3 = style.widgetHoveredBgColor;
		refs.circle.BackgroundTransparency = 0;
		refs.label.TextColor3 = style.textColor;
	} else {
		refs.circle.BackgroundColor3 = style.widgetInactiveBgColor;
		refs.circle.BackgroundTransparency = 0;
		refs.label.TextColor3 = style.textColor;
	}
	if (refs.stroke !== undefined) applyStrokeState(refs.stroke, state, style);

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
