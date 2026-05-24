import { widget, __scope, __useInstance, __useState, __useEffect, useRootInstance } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2, v2 } from "../primitives";
import { makeCorner, makeShadow, makeStroke } from "./shared";

export interface ModalOptions {
	title?: string;
	open?: boolean;
	closable?: boolean;
}
export interface ModalHandle {
	closed(): boolean;
}

interface ModalRefs {
	placeholder: Frame;
	overlay?: Frame;
	modalContent?: Frame;
	closeBtn?: TextButton;
}

const DIALOG_WIDTH = 320;

/** @widget */
export const modal = widget((options: string | ModalOptions, fn: () => void): ModalHandle => {
	const opts = typeIs(options, "string") ? ({ title: options } as ModalOptions) : (options ?? {});
	const open = opts.open !== false;
	const [closedSignal, setClosedSignal] = __useState("modal:closed", false);

	const refs = __useInstance("modal:instance", (rawRef) => {
		return create("Frame", {
			[rawRef as never]: "placeholder",
			BackgroundTransparency: 1,
			Size: udim2(0, 0, 0, 0),
		});
	}) as unknown as ModalRefs;

	__useEffect("modal:effect", () => {
		const rootGui = useRootInstance();
		if (rootGui === undefined) return;

		const style = useStyle();
		const padX = style.windowPadding.X;
		const padY = style.windowPadding.Y;
		const titleBarHeight = style.titleBarHeight;

		const overlay = new Instance("Frame");
		overlay.Name = "ModalOverlay";
		overlay.BackgroundColor3 = style.modalOverlayColor;
		overlay.BackgroundTransparency = style.modalOverlayTransparency;
		overlay.BorderSizePixel = 0;
		overlay.Size = udim2(1, 0, 1, 0);
		overlay.ZIndex = 300;
		overlay.Visible = false;
		overlay.Parent = rootGui;

		const dialog = new Instance("Frame");
		dialog.Name = "ModalDialog";
		dialog.BackgroundColor3 = style.windowBgColor;
		dialog.BackgroundTransparency = style.windowBgTransparency;
		dialog.BorderSizePixel = 0;
		dialog.AnchorPoint = v2(0.5, 0.5);
		dialog.Position = udim2(0.5, 0, 0.5, 0);
		dialog.Size = udim2(0, DIALOG_WIDTH, 0, 0);
		dialog.AutomaticSize = Enum.AutomaticSize.Y;
		dialog.ZIndex = 301;
		dialog.Parent = overlay;

		makeCorner(style.windowCornerRadius).Parent = dialog;
		makeStroke(style).Parent = dialog;
		const shadow = makeShadow(style);
		if (shadow !== undefined) shadow.Parent = dialog;

		const titleBar = new Instance("Frame");
		titleBar.Name = "TitleBar";
		titleBar.BackgroundColor3 = style.titleBgColor;
		titleBar.BackgroundTransparency = 0;
		titleBar.BorderSizePixel = 0;
		titleBar.Size = udim2(1, 0, 0, titleBarHeight);
		titleBar.ZIndex = 302;
		titleBar.Parent = dialog;

		const titleLabel = new Instance("TextLabel");
		titleLabel.Name = "Title";
		titleLabel.BackgroundTransparency = 1;
		titleLabel.Font = Enum.Font.Code;
		titleLabel.TextColor3 = style.strongTextColor;
		titleLabel.TextSize = style.textSize;
		titleLabel.TextXAlignment = Enum.TextXAlignment.Left;
		titleLabel.Size = udim2(1, -30, 1, 0);
		titleLabel.Position = udim2(0, padX, 0, 0);
		titleLabel.ZIndex = 303;
		titleLabel.Text = opts.title ?? "";
		titleLabel.Parent = titleBar;

		const closeBtn = new Instance("TextButton");
		closeBtn.Name = "CloseButton";
		closeBtn.BackgroundTransparency = 1;
		closeBtn.Font = Enum.Font.Code;
		closeBtn.TextColor3 = style.weakTextColor;
		closeBtn.TextSize = style.textSize + 2;
		closeBtn.Size = udim2(0, 16, 0, 16);
		closeBtn.AnchorPoint = v2(1, 0.5);
		closeBtn.Position = udim2(1, -padX, 0.5, 0);
		closeBtn.Text = "×";
		closeBtn.ZIndex = 303;
		closeBtn.AutoButtonColor = false;
		closeBtn.Visible = opts.closable === true;
		closeBtn.Parent = titleBar;
		const activatedSignal = (closeBtn as unknown as Record<string, RBXScriptSignal | undefined>).Activated;
		activatedSignal?.Connect(() => {
			setClosedSignal(true);
		});
		refs.closeBtn = closeBtn;

		const content = new Instance("Frame");
		content.Name = "ModalContent";
		content.BackgroundTransparency = 1;
		content.BorderSizePixel = 0;
		content.Size = udim2(1, 0, 0, 0);
		content.AutomaticSize = Enum.AutomaticSize.Y;
		content.Position = udim2(0, 0, 0, titleBarHeight);
		content.ZIndex = 302;
		content.Parent = dialog;

		const listLayout = new Instance("UIListLayout");
		listLayout.SortOrder = Enum.SortOrder.LayoutOrder;
		listLayout.Padding = udim(0, style.itemSpacing.Y);
		listLayout.Parent = content;

		const padding = new Instance("UIPadding");
		padding.PaddingLeft = udim(0, padX);
		padding.PaddingRight = udim(0, padX);
		padding.PaddingTop = udim(0, padY);
		padding.PaddingBottom = udim(0, padY);
		padding.Parent = content;

		refs.overlay = overlay;
		refs.modalContent = content;

		return () => {
			if (overlay !== undefined && overlay.Parent !== undefined) overlay.Destroy();
			refs.overlay = undefined;
			refs.modalContent = undefined;
		};
	});

	if (refs.closeBtn !== undefined) {
		refs.closeBtn.Visible = opts.closable === true;
	}

	if (refs.overlay !== undefined) {
		refs.overlay.Visible = open;

		if (open && refs.modalContent !== undefined) {
			const modalContent = refs.modalContent;
			__scope("modal:mount", () => {
				__useInstance("modal:portal", () => [undefined, modalContent] as [Instance | undefined, Instance]);
				__scope("modal:children", fn);
			});
		}
	}

	return {
		closed() {
			if (closedSignal) {
				setClosedSignal(false);
				return true;
			}
			return false;
		},
	};
}, "@rovy/ui/modal");
