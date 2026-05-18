import { widget, __callWidget, __scope, __useInstance } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim2 } from "../primitives";

export interface RowOptions {
	padding?: number | UDim;
	alignment?: CastsToEnum<Enum.HorizontalAlignment>;
	verticalAlignment?: CastsToEnum<Enum.VerticalAlignment>;
}

const rowWidget = widget((first: RowOptions | (() => void), second?: () => void) => {
	const fn = typeIs(first, "function") ? first : second;
	const refs = __useInstance("row:instance", (ref) =>
		create("Frame", {
			[ref as never]: "frame",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, useStyle().itemHeight),
			0: create("UIListLayout", {}),
		}),
	) as { frame: Frame };
	if (fn) __scope("row:children", fn);
}, "@rovy/ui/rowWidget");

/** @widget */
export function row(children: () => void): void;
export function row(options: RowOptions, children: () => void): void;
export function row(first: RowOptions | (() => void), second?: () => void): void {
	__callWidget(rowWidget as (...args: ReadonlyArray<unknown>) => void, "row", [first, second]);
}
