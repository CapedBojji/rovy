import { widget, __useInstance } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2 } from "../primitives";

export interface ProgressBarOptions {
	value: number;
	label?: string;
}

/** @widget */
export const progressBar = widget((options: ProgressBarOptions): void => {
	const value = math.clamp(options.value ?? 0, 0, 1);

	const refs = __useInstance("progressBar:instance", (ref) => {
		const style = useStyle();
		const trackHeight = style.itemHeight;
		return create("Frame", {
			[ref as never]: "frame",
			BackgroundColor3: style.frameBgColor,
			BackgroundTransparency: style.frameBgTransparency,
			BorderSizePixel: 0,
			Size: udim2(1, 0, 0, trackHeight),
			0: create("UICorner", { CornerRadius: udim(0, 2) }),
			1: create("Frame", {
				[ref as never]: "fill",
				BackgroundColor3: style.sliderGrabColor,
				BackgroundTransparency: 0,
				BorderSizePixel: 0,
				Size: udim2(0, 0, 1, 0),
				ZIndex: 2,
				0: create("UICorner", { CornerRadius: udim(0, 2) }),
			}),
			2: create("TextLabel", {
				[ref as never]: "label",
				BackgroundTransparency: 1,
				Font: Enum.Font.Code,
				TextColor3: style.textColor,
				TextSize: style.textSize,
				TextXAlignment: Enum.TextXAlignment.Center,
				Size: udim2(1, 0, 1, 0),
				ZIndex: 3,
			}),
		});
	}) as { frame: Frame; fill: Frame; label: TextLabel };

	const style = useStyle();
	refs.fill.Size = udim2(value, 0, 1, 0);
	refs.fill.BackgroundColor3 = style.sliderGrabColor;

	if (options.label !== undefined) {
		refs.label.Text = options.label;
	} else {
		refs.label.Text = `${math.floor(value * 100)}%`;
	}
}, "@rovy/ui/progressBar");
