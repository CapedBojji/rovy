import { widget, __scope, __useInstance, __useState, useHoverTarget } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2, v2 } from "../primitives";
import { isTopGuiTarget } from "./shared";

export interface CollapsingHeaderHandle {
	open(): boolean;
}

/** @widget */
export const collapsingHeader = widget((text: string, fn: () => void): CollapsingHeaderHandle => {
	const [isOpen, setIsOpen] = __useState("collapsingHeader:open", false);
	const [hovered, setHovered] = __useState("collapsingHeader:hovered", false);

	const refs = __useInstance("collapsingHeader:instance", (ref) => {
		const style = useStyle();
		const targetRef = ref as unknown as { header: TextButton };
		const outerFrame = create("Frame", {
			[ref as never]: "outer",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, style.itemHeight),
			AutomaticSize: Enum.AutomaticSize.Y,
			0: create("UIListLayout", {
				SortOrder: Enum.SortOrder.LayoutOrder,
				Padding: udim(0, 0),
			}),
			1: create("TextButton", {
				[ref as never]: "header",
				BackgroundColor3: style.widgetInactiveBgColor,
				BackgroundTransparency: 1,
				BorderSizePixel: 0,
				ClipsDescendants: true,
				Text: "",
				Size: udim2(1, 0, 0, style.itemHeight),
				LayoutOrder: 1,
				AutoButtonColor: false,
				0: create("UIPadding", {
					PaddingLeft: udim(0, 6),
					PaddingRight: udim(0, 6),
				}),
				3: create("UICorner", { CornerRadius: udim(0, style.cornerRadius) }),
				1: create("TextLabel", {
					[ref as never]: "arrow",
					BackgroundTransparency: 1,
					Font: Enum.Font.Code,
					TextColor3: style.weakTextColor,
					TextSize: style.textSize,
					TextXAlignment: Enum.TextXAlignment.Left,
					Size: udim2(0, 14, 1, 0),
					AnchorPoint: v2(0, 0.5),
					Position: udim2(0, 0, 0.5, 0),
					Text: "▶",
				}),
				2: create("TextLabel", {
					[ref as never]: "title",
					BackgroundTransparency: 1,
					Font: Enum.Font.Code,
					TextColor3: style.strongTextColor,
					TextSize: style.textSize,
					TextXAlignment: Enum.TextXAlignment.Left,
					TextTruncate: Enum.TextTruncate.AtEnd,
					Size: udim2(1, -20, 1, 0),
					AnchorPoint: v2(0, 0.5),
					Position: udim2(0, 18, 0.5, 0),
					}),
					Activated: () => {
						if (!isTopGuiTarget(targetRef.header)) return;
						setIsOpen((v) => !v);
					},
			}),
			2: create("Frame", {
				[ref as never]: "content",
				BackgroundTransparency: 1,
				Size: udim2(1, 0, 0, 0),
				AutomaticSize: Enum.AutomaticSize.Y,
				LayoutOrder: 2,
				0: create("UIListLayout", {
					SortOrder: Enum.SortOrder.LayoutOrder,
					Padding: udim(0, 4),
				}),
				1: create("UIPadding", {
					PaddingLeft: udim(0, 14),
					PaddingTop: udim(0, 4),
					PaddingBottom: udim(0, 4),
				}),
			}),
		});
		return [outerFrame, ref.content] as [Instance, Instance];
	}) as { outer: Frame; header: TextButton; arrow: TextLabel; title: TextLabel; content: Frame };

	useHoverTarget(refs.header, setHovered, `CollapsingHeader: ${text}`);

	const style = useStyle();

	refs.title.Text = text;
	refs.arrow.Text = isOpen ? "▼" : "▶";
	refs.content.Visible = isOpen;

	if (hovered) {
		refs.header.BackgroundColor3 = style.widgetHoveredBgColor;
		refs.header.BackgroundTransparency = 0;
	} else {
		refs.header.BackgroundTransparency = 1;
	}

	if (isOpen && fn !== undefined) {
		__scope("collapsingHeader:children", fn);
	}

	return {
		open() {
			return isOpen;
		},
	};
}, "@rovy/ui/collapsingHeader");
