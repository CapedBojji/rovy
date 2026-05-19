import { widget, __scope, __useInstance, __useState, provideContext } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { c, udim, udim2, v2 } from "../primitives";
import * as contexts from "../contexts";

export interface ChildWindowOptions {
	title?: string;
	height?: number;
	minimizable?: boolean;
	scrollX?: boolean;
	scrollY?: boolean;
}
export interface ChildWindowHandle {
	minimized(): boolean;
}

interface ChildWindowRefs {
	frame: Frame;
	headerBar: TextButton;
	title: TextLabel;
	minimize: TextButton;
	container: ScrollingFrame;
}

function pointInside(guiObject: GuiObject | undefined, position: Vector3): boolean {
	if (guiObject === undefined || !guiObject.Visible) return false;
	const absolutePosition = guiObject.AbsolutePosition;
	const absoluteSize = guiObject.AbsoluteSize;
	return (
		position.X >= absolutePosition.X &&
		position.X <= absolutePosition.X + absoluteSize.X &&
		position.Y >= absolutePosition.Y &&
		position.Y <= absolutePosition.Y + absoluteSize.Y
	);
}

/** @widget */
export const childWindow = widget((options: string | ChildWindowOptions, fn: () => void): ChildWindowHandle => {
	const opts = typeIs(options, "string") ? ({ title: options } as ChildWindowOptions) : (options ?? {});
	const [minimized, setMinimized] = __useState("childWindow:minimized", false);

	const contentHeight = opts.height ?? 200;
	const minimizable = opts.minimizable !== undefined ? opts.minimizable : true;

	const refs = __useInstance("childWindow:instance", (rawRef) => {
		const ref = rawRef as unknown as ChildWindowRefs;
		const style = useStyle();
		const titleBarHeight = style.titleBarHeight;
		const padX = style.windowPadding.X;
		const padY = style.windowPadding.Y;

		create("Frame", {
			[rawRef as never]: "frame",
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
			Size: udim2(1, 0, 0, titleBarHeight + contentHeight),
			ClipsDescendants: false,
			0: create("UIListLayout", {
				SortOrder: Enum.SortOrder.LayoutOrder,
				Padding: udim(0, 0),
			}),
			1: create("TextButton", {
				[rawRef as never]: "headerBar",
				BackgroundColor3: style.titleBgActiveColor,
				BackgroundTransparency: 0,
				BorderSizePixel: 0,
				Size: udim2(1, 0, 0, titleBarHeight),
				Text: "",
				Active: true,
				AutoButtonColor: false,
				LayoutOrder: 1,
				0: create("UICorner", { CornerRadius: udim(0, 0) }),
				1: create("UIListLayout", {
					FillDirection: Enum.FillDirection.Horizontal,
					VerticalAlignment: Enum.VerticalAlignment.Center,
					SortOrder: Enum.SortOrder.LayoutOrder,
					Padding: udim(0, 4),
				}),
				2: create("UIPadding", {
					PaddingLeft: udim(0, padX),
					PaddingRight: udim(0, 4),
				}),
				3: create("TextLabel", {
					[rawRef as never]: "title",
					BackgroundTransparency: 1,
					Font: Enum.Font.GothamBold,
					TextColor3: style.textColor,
					TextSize: style.textSize,
					TextXAlignment: Enum.TextXAlignment.Left,
					TextYAlignment: Enum.TextYAlignment.Center,
					Size: udim2(0, 0, 1, 0),
					LayoutOrder: 1,
					0: create("UIFlexItem", { FlexMode: Enum.UIFlexMode.Fill }),
				}),
				4: create("TextButton", {
					[rawRef as never]: "minimize",
					BackgroundTransparency: 1,
					Font: Enum.Font.GothamBold,
					TextColor3: c(200, 200, 200),
					TextSize: style.textSize + 2,
					Size: udim2(0, 16, 0, 16),
					Text: "−",
					LayoutOrder: 2,
					Visible: false,
					MouseEnter: () => {
						ref.minimize.TextColor3 = c(255, 255, 255);
					},
					MouseLeave: () => {
						ref.minimize.TextColor3 = c(200, 200, 200);
					},
					Activated: () => {
						setMinimized((prev) => !prev);
					},
				}),
				InputEnded: (...args: ReadonlyArray<unknown>) => {
					const inputObj = args[0] as InputObject;
					if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
					if (!ref.minimize.Visible || pointInside(ref.minimize, inputObj.Position)) return;
					setMinimized((prev) => !prev);
				},
			}),
			2: create("ScrollingFrame", {
				[rawRef as never]: "container",
				BackgroundColor3: style.windowBgColor,
				BackgroundTransparency: style.windowBgTransparency,
				BorderSizePixel: 0,
				ScrollBarThickness: style.scrollbarSize,
				ScrollBarImageColor3: style.scrollbarGrabColor,
				VerticalScrollBarInset: Enum.ScrollBarInset.ScrollBar,
				HorizontalScrollBarInset: Enum.ScrollBarInset.ScrollBar,
				Size: udim2(1, 0, 0, contentHeight),
				CanvasSize: udim2(0, 0, 0, 0),
				AutomaticCanvasSize: Enum.AutomaticSize.Y,
				LayoutOrder: 2,
				0: create("UIListLayout", {
					SortOrder: Enum.SortOrder.LayoutOrder,
					Padding: udim(0, style.itemSpacing.Y),
				}),
				1: create("UIPadding", {
					PaddingLeft: udim(0, padX),
					PaddingRight: udim(0, padX),
					PaddingTop: udim(0, padY),
					PaddingBottom: udim(0, padY),
				}),
			}),
		});

		return [ref.frame, ref.container] as [Instance, Instance];
	}) as unknown as ChildWindowRefs;

	const style = useStyle();
	const titleBarHeight = style.titleBarHeight;

	refs.title.Text = opts.title ?? "";
	refs.minimize.Visible = minimizable;

	if (minimized) {
		refs.frame.Size = udim2(1, 0, 0, titleBarHeight);
		refs.container.Visible = false;
	} else {
		refs.frame.Size = udim2(1, 0, 0, titleBarHeight + contentHeight);
		refs.container.Size = udim2(1, 0, 0, contentHeight);
		refs.container.Visible = true;
	}

	const scrollX = opts.scrollX ?? false;
	const scrollY = opts.scrollY !== undefined ? opts.scrollY : true;
	if (scrollX && scrollY) {
		refs.container.AutomaticCanvasSize = Enum.AutomaticSize.XY;
	} else if (scrollX) {
		refs.container.AutomaticCanvasSize = Enum.AutomaticSize.X;
	} else if (scrollY) {
		refs.container.AutomaticCanvasSize = Enum.AutomaticSize.Y;
	} else {
		refs.container.AutomaticCanvasSize = Enum.AutomaticSize.None;
	}

	provideContext(contexts.scrollX, scrollX);

	if (!minimized) __scope("childWindow:children", fn);

	return {
		minimized() {
			if (minimized) {
				setMinimized(false);
				return true;
			}
			return false;
		},
	};
}, "@rovy/ui/childWindow");
