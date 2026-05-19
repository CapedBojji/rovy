import { widget, __useInstance, __useEffect } from "../runtime";
import { create } from "../create";
import { udim2 } from "../primitives";

/** @widget */
export const space = widget((size = 8): void => {
	const refs = __useInstance("space:instance", (ref) =>
		create("Frame", {
			[ref as never]: "space",
			BackgroundTransparency: 1,
			Size: udim2(0, size, 0, size),
		}),
	) as { space: Frame };

	__useEffect(
		"space:effect",
		() => {
			refs.space.Size = udim2(0, size, 0, size);
		},
		size,
	);
}, "@rovy/ui/space");
