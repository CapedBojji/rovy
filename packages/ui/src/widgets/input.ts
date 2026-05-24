import { widget, __useInstance, __useState, __useEffect } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2 } from "../primitives";

export interface InputOptions {
	text?: string;
	placeholder?: string;
	label?: string;
}
export interface InputHandle {
	value(): string;
	changed(): boolean;
	submitted(): boolean;
}

interface InputRefs {
	frame: Frame;
	inputBg: Frame;
	inputStroke: UIStroke;
	textBox: TextBox;
	label?: TextLabel;
	textConnection?: RBXScriptConnection;
}

/** @widget */
export const input = widget((options: InputOptions = {}): InputHandle => {
	const [textValue, setTextValue] = __useState("input:value", options.text ?? "");
	const [changed, setChanged] = __useState("input:changed", false);
	const [submitted, setSubmitted] = __useState("input:submitted", false);
	const [focused, setFocused] = __useState("input:focused", false);

	const refs = __useInstance("input:instance", (rawRef) => {
		const ref = rawRef as unknown as InputRefs;
		const style = useStyle();

		const frame = create("Frame", {
			[rawRef as never]: "frame",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, style.itemHeight),
		});

		let labelWidth = 0;
		if (options.label !== undefined) {
			labelWidth = 80;
			create("TextLabel", {
				[rawRef as never]: "label",
				Parent: frame,
				BackgroundTransparency: 1,
				Font: Enum.Font.Code,
				TextColor3: style.textColor,
				TextSize: style.textSize,
				TextXAlignment: Enum.TextXAlignment.Left,
				TextYAlignment: Enum.TextYAlignment.Center,
				Size: udim2(0, labelWidth - 4, 1, 0),
				Position: udim2(0, 0, 0, 0),
			});
		}

		create("Frame", {
			[rawRef as never]: "inputBg",
			Parent: frame,
			BackgroundColor3: style.extremeBgColor,
			BackgroundTransparency: 0,
			BorderSizePixel: 0,
			Size: udim2(1, -labelWidth, 1, 0),
			Position: udim2(0, labelWidth, 0, 0),
			0: create("UICorner", { CornerRadius: udim(0, style.cornerRadius) }),
			1: create("UIStroke", {
				[rawRef as never]: "inputStroke",
				Color: style.strokeInactiveColor,
				Transparency: style.strokeInactiveTransparency,
				Thickness: style.strokeThickness, ApplyStrokeMode: Enum.ApplyStrokeMode.Border,
			}),
			2: create("TextBox", {
				[rawRef as never]: "textBox",
				BackgroundTransparency: 1,
				Font: Enum.Font.Code,
				TextColor3: style.textColor,
				PlaceholderColor3: style.textDisabledColor,
				TextSize: style.textSize,
				TextXAlignment: Enum.TextXAlignment.Left,
				TextYAlignment: Enum.TextYAlignment.Center,
				Size: udim2(1, 0, 1, 0),
				ClearTextOnFocus: false,
				TextTruncate: Enum.TextTruncate.AtEnd,
				0: create("UIPadding", {
					PaddingLeft: udim(0, 4),
					PaddingRight: udim(0, 4),
				}),
				Focused: () => {
					setFocused(true);
				},
				FocusLost: (enterPressed: boolean) => {
					setFocused(false);
					if (enterPressed) setSubmitted(true);
				},
			}),
		});

		const [signalOk, signal] = pcall(() => ref.textBox.GetPropertyChangedSignal("Text"));
		if (signalOk && signal !== undefined) {
			ref.textConnection = signal.Connect(() => {
				setTextValue(ref.textBox.Text);
				setChanged(true);
			});
		}

		return frame;
	}) as unknown as InputRefs;

	__useEffect("input:effect", () => {
		return () => {
			if (refs.textConnection !== undefined) {
				refs.textConnection.Disconnect();
				refs.textConnection = undefined;
			}
		};
	});

	const style = useStyle();
	const box = refs.textBox;

	if (!focused && options.text !== undefined && box.Text !== options.text) {
		box.Text = options.text;
	}

	box.PlaceholderText = options.placeholder ?? "";

	if (focused) {
		refs.inputStroke.Color = style.accentColor;
		refs.inputStroke.Transparency = 0;
	} else {
		refs.inputStroke.Color = style.strokeInactiveColor;
		refs.inputStroke.Transparency = style.strokeInactiveTransparency;
	}

	if (refs.label !== undefined) {
		refs.label.Text = options.label ?? "";
	}

	return {
		value() {
			return box.Text;
		},
		changed() {
			if (changed) {
				setChanged(false);
				return true;
			}
			return false;
		},
		submitted() {
			if (submitted) {
				setSubmitted(false);
				return true;
			}
			return false;
		},
	};
}, "@rovy/ui/input");
