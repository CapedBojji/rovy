import { widget, __scope, __useInstance, provideContext } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2 } from "../primitives";
import * as contexts from "../contexts";

export interface RowOptions {
	padding?: number | UDim;
	alignment?: CastsToEnum<Enum.HorizontalAlignment>;
	verticalAlignment?: CastsToEnum<Enum.VerticalAlignment>;
	/** Overflow horizontally into a scroll region instead of shrinking children. */
	scrollX?: boolean;
}

const rowWidget = widget((first: RowOptions | (() => void), second?: () => void) => {
	const fn = typeIs(first, "function") ? first : second;
	const options: RowOptions = typeIs(first, "function") ? {} : first;
	const scrollX = options.scrollX ?? false;

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

	const refs = __useInstance("row:instance", (ref) => {
		const style = useStyle();
		const layout = create("UIListLayout", {
			[ref as never]: "layout",
			SortOrder: Enum.SortOrder.LayoutOrder,
			FillDirection: Enum.FillDirection.Horizontal,
			Padding: padding,
		});
		if (scrollX) {
			return create("ScrollingFrame", {
				[ref as never]: "frame",
				BackgroundTransparency: 1,
				BorderSizePixel: 0,
				ClipsDescendants: true,
				ScrollingDirection: Enum.ScrollingDirection.X,
				ScrollBarThickness: style.scrollbarSize,
				ScrollBarImageColor3: style.scrollbarGrabColor,
				HorizontalScrollBarInset: Enum.ScrollBarInset.ScrollBar,
				CanvasSize: udim2(0, 0, 0, 0),
				AutomaticCanvasSize: Enum.AutomaticSize.X,
				Size: udim2(1, 0, 0, style.itemHeight + style.scrollbarSize),
				0: layout,
			});
		}
		return create("Frame", {
			[ref as never]: "frame",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, style.itemHeight),
			0: layout,
		});
	}) as { frame: GuiObject; layout: UIListLayout };

	refs.layout.HorizontalAlignment = (options.alignment ?? Enum.HorizontalAlignment.Left) as Enum.HorizontalAlignment;
	refs.layout.VerticalAlignment = (options.verticalAlignment ?? Enum.VerticalAlignment.Center) as Enum.VerticalAlignment;
	refs.layout.Padding = padding;

	if (scrollX) {
		provideContext(contexts.scrollX, true);
		if (fn) __scope("row:children", fn);
		return;
	}

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
	__scope("row", () => rowWidget(first, second));
}
