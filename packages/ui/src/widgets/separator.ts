import { widget, __useInstance } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim2 } from "../primitives";

/** @widget */
export const separator = widget((): void => {
	const style = useStyle();
	__useInstance("separator:instance", () =>
		create("Frame", {
			BackgroundColor3: style.separatorColor,
			BackgroundTransparency: style.separatorTransparency,
			BorderSizePixel: 0,
			Size: udim2(1, 0, 0, 1),
		}),
	);
}, "@rovy/ui/separator");
