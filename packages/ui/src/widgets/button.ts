import { widget, __useInstance, __useState, useHoverTarget } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim2 } from "../primitives";
import { applyStrokeState, isTopGuiTarget, makeCorner, type InteractState } from "./shared";

export interface ButtonOptions {
	width?: number | UDim;
	disabled?: boolean;
}
export interface ButtonHandle {
	clicked(): boolean;
}

/** @widget */
export const button = widget((text: string, options: ButtonOptions = {}): ButtonHandle => {
	const [clicked, setClicked] = __useState("button:clicked", false);
	const [hovered, setHovered] = __useState("button:hovered", false);
	const [pressing, setPressing] = __useState("button:pressing", false);

	const refs = __useInstance("button:instance", (ref) => {
		const style = useStyle();
		const targetRef = ref as unknown as { button: TextButton };
		return create("TextButton", {
			[ref as never]: "button",
			BorderSizePixel: 0,
			Font: Enum.Font.Code,
			TextColor3: style.textColor,
			TextSize: style.textSize,
			Size: udim2(1, 0, 0, style.itemHeight),
			BackgroundColor3: style.widgetInactiveBgColor,
			BackgroundTransparency: 0,
			AutoButtonColor: false,
			0: makeCorner(style.cornerRadius),
			1: create("UIStroke", {
				[ref as never]: "stroke",
				Color: style.strokeInactiveColor,
				Transparency: style.strokeInactiveTransparency,
				Thickness: style.strokeThickness, ApplyStrokeMode: Enum.ApplyStrokeMode.Border,
			}),
				MouseButton1Down: () => {
					if (!isTopGuiTarget(targetRef.button)) return;
					setPressing(true);
				},
			MouseButton1Up: () => {
				setPressing(false);
			},
				Activated: () => {
					if (options.disabled === true || !isTopGuiTarget(targetRef.button)) return;
					setClicked(true);
				},
		});
	}) as { button: TextButton; stroke: UIStroke };

	useHoverTarget(refs.button, (value) => {
		setHovered(value);
		if (!value) setPressing(false);
	}, `Button: ${text}`);

	const btn = refs.button;
	btn.Text = text;
	btn.AutoButtonColor = false;

	const style = useStyle();
	let state: InteractState = "inactive";
	if (options.disabled === true) state = "disabled";
	else if (pressing) state = "active";
	else if (hovered) state = "hovered";

	if (state === "disabled") {
		btn.BackgroundColor3 = style.widgetInactiveBgColor;
		btn.BackgroundTransparency = 0.5;
		btn.TextColor3 = style.textDisabledColor;
	} else if (state === "active") {
		btn.BackgroundColor3 = style.widgetActiveBgColor;
		btn.BackgroundTransparency = 0;
		btn.TextColor3 = style.strongTextColor;
	} else if (state === "hovered") {
		btn.BackgroundColor3 = style.widgetHoveredBgColor;
		btn.BackgroundTransparency = 0;
		btn.TextColor3 = style.strongTextColor;
	} else {
		btn.BackgroundColor3 = style.widgetInactiveBgColor;
		btn.BackgroundTransparency = 0;
		btn.TextColor3 = style.textColor;
	}

	if (refs.stroke !== undefined) applyStrokeState(refs.stroke, state, style);

	if (options.width !== undefined) {
		const w = options.width;
		if (typeIs(w, "number")) {
			btn.Size = udim2(0, w, 0, style.itemHeight);
		} else {
			btn.Size = udim2(w.Scale, w.Offset, 0, style.itemHeight);
		}
	}

	return {
		clicked() {
			if (clicked) {
				setClicked(false);
				return true;
			}
			return false;
		},
	};
}, "@rovy/ui/button");
