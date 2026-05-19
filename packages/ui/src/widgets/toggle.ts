import { widget, __useInstance, __useState } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2, v2 } from "../primitives";

export interface ToggleOptions {
	on?: boolean;
	disabled?: boolean;
}
export interface ToggleHandle {
	on(): boolean;
	clicked(): boolean;
}

const TRACK_WIDTH = 36;
const TRACK_HEIGHT = 18;
const HANDLE_SIZE = 14;

/** @widget */
export const toggle = widget((text: string, options: ToggleOptions = {}): ToggleHandle => {
	const [isOn, setIsOn] = __useState("toggle:on", false);
	const [clicked, setClicked] = __useState("toggle:clicked", false);
	const [hovered, setHovered] = __useState("toggle:hovered", false);

	const refs = __useInstance("toggle:instance", (ref) => {
		const style = useStyle();
		return create("Frame", {
			[ref as never]: "row",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, style.itemHeight),
			0: create("TextButton", {
				[ref as never]: "track",
				BackgroundColor3: style.toggleOffColor,
				BackgroundTransparency: 0,
				BorderSizePixel: 0,
				Text: "",
				Size: udim2(0, TRACK_WIDTH, 0, TRACK_HEIGHT),
				AnchorPoint: v2(0, 0.5),
				Position: udim2(0, 0, 0.5, 0),
				AutoButtonColor: false,
				0: create("UICorner", { CornerRadius: udim(1, 0) }),
				1: create("Frame", {
					[ref as never]: "handle",
					BackgroundColor3: style.toggleHandleColor,
					BackgroundTransparency: 0,
					BorderSizePixel: 0,
					Size: udim2(0, HANDLE_SIZE, 0, HANDLE_SIZE),
					AnchorPoint: v2(0.5, 0.5),
					Position: udim2(0, HANDLE_SIZE / 2 + 2, 0.5, 0),
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
						setIsOn((v) => !v);
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
				Size: udim2(1, -(TRACK_WIDTH + 8), 1, 0),
				Position: udim2(0, TRACK_WIDTH + 8, 0, 0),
			}),
		});
	}) as { row: Frame; track: TextButton; handle: Frame; label: TextLabel };

	const style = useStyle();
	const currentOn = options.on !== undefined ? options.on : isOn;

	const handleX = currentOn ? TRACK_WIDTH - HANDLE_SIZE / 2 - 2 : HANDLE_SIZE / 2 + 2;
	refs.handle.Position = udim2(0, handleX, 0.5, 0);

	if (options.disabled === true) {
		refs.track.BackgroundColor3 = style.toggleOffColor;
		refs.track.BackgroundTransparency = 0.5;
		refs.label.TextColor3 = style.textDisabledColor;
	} else if (currentOn) {
		refs.track.BackgroundColor3 = style.toggleOnColor;
		refs.track.BackgroundTransparency = hovered ? 0.2 : 0;
		refs.label.TextColor3 = style.textColor;
	} else {
		refs.track.BackgroundColor3 = style.toggleOffColor;
		refs.track.BackgroundTransparency = hovered ? 0.2 : 0;
		refs.label.TextColor3 = style.textColor;
	}

	refs.handle.BackgroundColor3 = style.toggleHandleColor;
	refs.label.Text = text;

	return {
		on() {
			return currentOn;
		},
		clicked() {
			if (clicked) {
				setClicked(false);
				return true;
			}
			return false;
		},
	};
}, "@rovy/ui/toggle");
