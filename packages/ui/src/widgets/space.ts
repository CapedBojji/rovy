import { widget, __useInstance } from "../runtime";
import { create } from "../create";
import { udim2 } from "../primitives";

/** @widget */
export const space = widget((size = 8): void => {
	__useInstance("space:instance", () => create("Frame", { BackgroundTransparency: 1, Size: udim2(1, 0, 0, size) }));
}, "@rovy/ui/space");
