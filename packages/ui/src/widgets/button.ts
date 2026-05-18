import { widget, __useInstance, __useState } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { basicHandle, frameProps } from "./shared";

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
	const refs = __useInstance("button:instance", (ref) =>
		create("TextButton", {
			[ref as never]: "button",
			...frameProps(useStyle()),
			Text: text,
			Activated: () => {
				if (!options.disabled) setClicked(true);
			},
		}),
	) as { button: TextButton };
	const style = useStyle();
	refs.button.Text = text;
	refs.button.TextColor3 = options.disabled ? style.textDisabledColor : style.textColor;
	return basicHandle(clicked, setClicked, "clicked") as unknown as ButtonHandle;
}, "@rovy/ui/button");
