import { widget, __useInstance, __useState } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2 } from "../primitives";

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
		return create("TextButton", {
			[ref as never]: "button",
			BorderSizePixel: 0,
			Font: Enum.Font.Code,
			TextColor3: style.textColor,
			TextSize: style.textSize,
			Size: udim2(1, 0, 0, style.itemHeight),
			BackgroundColor3: style.buttonColor,
			BackgroundTransparency: style.buttonTransparency,
			AutoButtonColor: false,
			0: create("UICorner", { CornerRadius: udim(0, 0) }),
			1: create("UIStroke", {
				Color: style.borderColor,
				Transparency: style.borderTransparency,
				Thickness: 1,
			}),
			MouseEnter: () => {
				setHovered(true);
			},
			MouseLeave: () => {
				setHovered(false);
				setPressing(false);
			},
			MouseButton1Down: () => {
				print("[Button] MouseButton1Down:", text);
				setPressing(true);
			},
			MouseButton1Up: () => {
				setPressing(false);
			},
			Activated: () => {
				print("[Button] Activated:", text);
				if (options.disabled !== true) setClicked(true);
			},
		});
	}) as { button: TextButton };

	const btn = refs.button;
	btn.Text = text;
	btn.AutoButtonColor = false;

	const style = useStyle();
	if (options.disabled === true) {
		btn.BackgroundColor3 = style.buttonColor;
		btn.BackgroundTransparency = 0.8;
		btn.TextColor3 = style.textDisabledColor;
	} else if (pressing) {
		btn.BackgroundColor3 = style.buttonActiveColor;
		btn.BackgroundTransparency = style.buttonActiveTransparency;
		btn.TextColor3 = style.textColor;
	} else if (hovered) {
		btn.BackgroundColor3 = style.buttonHoveredColor;
		btn.BackgroundTransparency = style.buttonHoveredTransparency;
		btn.TextColor3 = style.textColor;
	} else {
		btn.BackgroundColor3 = style.buttonColor;
		btn.BackgroundTransparency = style.buttonTransparency;
		btn.TextColor3 = style.textColor;
	}

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
