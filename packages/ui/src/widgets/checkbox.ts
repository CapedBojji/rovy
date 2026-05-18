import { widget, __useInstance, __useState } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { frameProps } from "./shared";

export interface CheckboxOptions {
	checked?: boolean;
	disabled?: boolean;
}
export interface CheckboxHandle {
	checked(): boolean;
	clicked(): boolean;
}

/** @widget */
export const checkbox = widget((text: string, options: CheckboxOptions = {}): CheckboxHandle => {
	const [checked, setChecked] = __useState("checkbox:checked", options.checked ?? false);
	const [clicked, setClicked] = __useState("checkbox:clicked", false);
	const refs = __useInstance("checkbox:instance", (ref) =>
		create("TextButton", {
			[ref as never]: "button",
			...frameProps(useStyle()),
			Activated: () => {
				if (!options.disabled) {
					setChecked((value) => !value);
					setClicked(true);
				}
			},
		}),
	) as { button: TextButton };
	refs.button.Text = `${checked ? "[x]" : "[ ]"} ${text}`;
	return {
		checked() {
			return checked;
		},
		clicked() {
			if (!clicked) return false;
			setClicked(false);
			return true;
		},
	};
}, "@rovy/ui/checkbox");
