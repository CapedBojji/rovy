import { widget, __callWidget, __scope, __useInstance } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2 } from "../primitives";

export interface RowOptions {
	padding?: number | UDim;
	alignment?: CastsToEnum<Enum.HorizontalAlignment>;
	verticalAlignment?: CastsToEnum<Enum.VerticalAlignment>;
}

const rowWidget = widget((first: RowOptions | (() => void), second?: () => void) => {
	const fn = typeIs(first, "function") ? first : second;
	const options: RowOptions = typeIs(first, "function") ? {} : first;

	let padding: UDim;
	if (options.padding !== undefined) {
		if (typeIs(options.padding, "number")) {
			padding = udim(0, options.padding);
		} else {
			padding = options.padding;
		}
	} else {
		padding = udim(0, 8);
	}

	const refs = __useInstance("row:instance", (ref) =>
		create("Frame", {
			[ref as never]: "frame",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, useStyle().itemHeight),
			0: create("UIListLayout", {
				[ref as never]: "layout",
				SortOrder: Enum.SortOrder.LayoutOrder,
				FillDirection: Enum.FillDirection.Horizontal,
				Padding: padding,
			}),
		}),
	) as { frame: Frame; layout: UIListLayout };

	refs.layout.HorizontalAlignment = (options.alignment ?? Enum.HorizontalAlignment.Left) as Enum.HorizontalAlignment;
	refs.layout.VerticalAlignment = (options.verticalAlignment ?? Enum.VerticalAlignment.Center) as Enum.VerticalAlignment;
	refs.layout.Padding = padding;

	if (fn) __scope("row:children", fn);

	// Only manage UIFlexItems we own (tagged "_rowManaged") so callers that
	// configure their own UIFlexItem on a child are not overwritten.
	for (const child of refs.frame.GetChildren()) {
		if (child.IsA("GuiObject")) {
			const childSize = child.Size as { X?: { Scale?: number } } | undefined;
			if (childSize === undefined || childSize.X === undefined || childSize.X.Scale === undefined) continue;
			if (childSize.X.Scale > 0) {
				let fi = child.FindFirstChildOfClass("UIFlexItem");
				if (fi === undefined) {
					fi = new Instance("UIFlexItem", child);
					fi.SetAttribute("_rowManaged", true);
					fi.FlexMode = Enum.UIFlexMode.Fill;
				}
			} else {
				const fi = child.FindFirstChildOfClass("UIFlexItem");
				if (fi !== undefined && fi.GetAttribute("_rowManaged") === true) {
					fi.Destroy();
				}
			}
		}
	}
}, "@rovy/ui/rowWidget");

/** @widget */
export function row(children: () => void): void;
export function row(options: RowOptions, children: () => void): void;
export function row(first: RowOptions | (() => void), second?: () => void): void {
	__callWidget(rowWidget as (...args: ReadonlyArray<unknown>) => void, "row", [first, second]);
}
