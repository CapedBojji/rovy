import { widget, __useInstance, __useState } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { frameProps } from "./shared";

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

/** @widget */
export const input = widget((options: InputOptions = {}): InputHandle => {
	const [value, setValue] = __useState("input:value", options.text ?? "");
	const [changed, setChanged] = __useState("input:changed", false);
	const refs = __useInstance("input:instance", (ref) =>
		create("TextBox", {
			[ref as never]: "box",
			...frameProps(useStyle()),
			Text: value,
			PlaceholderText: options.placeholder ?? "",
			FocusLost: () => setChanged(true),
		}),
	) as { box: TextBox };
	refs.box.Text = value;
	return {
		value() {
			return value;
		},
		changed() {
			if (!changed) return false;
			setChanged(false);
			return true;
		},
		submitted() {
			return false;
		},
	};
}, "@rovy/ui/input");
