import { widget, __scope, __useInstance, __useEffect, useRootInstance } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2 } from "../primitives";

export interface PopupOptions {
	open?: boolean;
	position?: Vector2;
}

interface PopupRefs {
	placeholder: Frame;
	popupPanel?: Frame;
	popupContent?: Frame;
}

const MIN_WIDTH = 120;

/** @widget */
export const popup = widget((options: PopupOptions, fn: () => void): void => {
	const opts = options ?? {};
	const open = opts.open ?? false;

	const refs = __useInstance("popup:instance", (rawRef) => {
		const ref = rawRef as unknown as PopupRefs;
		const placeholder = create("Frame", {
			[rawRef as never]: "placeholder",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, 0),
		});
		return placeholder;
	}) as unknown as PopupRefs;

	__useEffect("popup:effect", () => {
		const rootGui = useRootInstance();
		if (rootGui === undefined) return;

		const style = useStyle();

		const panel = new Instance("Frame");
		panel.Name = "PopupPanel";
		panel.BackgroundColor3 = style.popupBgColor;
		panel.BackgroundTransparency = 0;
		panel.BorderSizePixel = 0;
		panel.Size = udim2(0, MIN_WIDTH, 0, 0);
		panel.AutomaticSize = Enum.AutomaticSize.Y;
		panel.ZIndex = 200;
		panel.Visible = false;
		panel.Parent = rootGui;

		const corner = new Instance("UICorner");
		corner.CornerRadius = udim(0, 2);
		corner.Parent = panel;

		const stroke = new Instance("UIStroke");
		stroke.Color = style.borderColor;
		stroke.Transparency = style.borderTransparency;
		stroke.Thickness = 1;
		stroke.Parent = panel;

		const content = new Instance("Frame");
		content.Name = "PopupContent";
		content.BackgroundTransparency = 1;
		content.Size = udim2(1, 0, 0, 0);
		content.AutomaticSize = Enum.AutomaticSize.Y;
		content.ZIndex = 200;
		content.Parent = panel;

		const listLayout = new Instance("UIListLayout");
		listLayout.SortOrder = Enum.SortOrder.LayoutOrder;
		listLayout.Padding = udim(0, 2);
		listLayout.Parent = content;

		const padding = new Instance("UIPadding");
		padding.PaddingLeft = udim(0, 6);
		padding.PaddingRight = udim(0, 6);
		padding.PaddingTop = udim(0, 4);
		padding.PaddingBottom = udim(0, 4);
		padding.Parent = content;

		refs.popupPanel = panel;
		refs.popupContent = content;

		return () => {
			if (panel !== undefined && panel.Parent !== undefined) panel.Destroy();
			refs.popupPanel = undefined;
			refs.popupContent = undefined;
		};
	});

	if (refs.popupPanel !== undefined) {
		refs.popupPanel.Visible = open;

		if (open) {
			if (opts.position !== undefined) {
				refs.popupPanel.Position = udim2(0, opts.position.X, 0, opts.position.Y);
				refs.popupPanel.Size = udim2(0, math.max(MIN_WIDTH, refs.placeholder.AbsoluteSize.X), 0, 0);
			} else {
				const abs = refs.placeholder.AbsolutePosition;
				const w = math.max(MIN_WIDTH, refs.placeholder.AbsoluteSize.X);
				refs.popupPanel.Position = udim2(0, abs.X, 0, abs.Y);
				refs.popupPanel.Size = udim2(0, w, 0, 0);
			}

			if (refs.popupContent !== undefined) {
				const popupContent = refs.popupContent;
				__scope("popup:mount", () => {
					__useInstance("popup:portal", () => [undefined, popupContent] as [Instance | undefined, Instance]);
					__scope("popup:children", fn);
				});
			}
		}
	}
}, "@rovy/ui/popup");
