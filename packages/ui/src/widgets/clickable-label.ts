import { widget, __useInstance, __useState } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim2 } from "../primitives";

export interface ClickableLabelOptions {
	textSize?: number;
	color?: Color3;
}
export interface ClickableLabelHandle {
	clicked(): boolean;
}

function brighten(color: Color3): Color3 {
	const [ok, value] = pcall(
		() =>
			new Color3(
				math.min(color.R + 0.15, 1),
				math.min(color.G + 0.15, 1),
				math.min(color.B + 0.15, 1),
			),
	);
	if (ok) return value;
	return color;
}

/** @widget */
export const clickableLabel = widget((text: string, options: ClickableLabelOptions = {}): ClickableLabelHandle => {
	const [clicked, setClicked] = __useState("clickableLabel:clicked", false);
	const [hovered, setHovered] = __useState("clickableLabel:hovered", false);

	const refs = __useInstance("clickableLabel:instance", (ref) => {
		const style = useStyle();
		return create("TextButton", {
			[ref as never]: "btn",
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
			Font: Enum.Font.Code,
			TextColor3: options.color ?? style.accentColor,
			TextSize: options.textSize ?? style.textSize,
			TextXAlignment: Enum.TextXAlignment.Left,
			Size: udim2(1, 0, 0, style.itemHeight),
			AutoButtonColor: false,
			RichText: true,
			MouseEnter: () => {
				setHovered(true);
			},
			MouseLeave: () => {
				setHovered(false);
			},
			Activated: () => {
				setClicked(true);
			},
		});
	}) as { btn: TextButton };

	const style = useStyle();
	const baseColor = options.color ?? style.accentColor;
	let displayText = text;

	if (hovered) {
		refs.btn.TextColor3 = brighten(baseColor);
		displayText = `<u>${text}</u>`;
	} else {
		refs.btn.TextColor3 = baseColor;
	}

	refs.btn.Text = displayText;
	refs.btn.TextSize = options.textSize ?? style.textSize;

	return {
		clicked() {
			if (clicked) {
				setClicked(false);
				return true;
			}
			return false;
		},
	};
}, "@rovy/ui/clickableLabel");
