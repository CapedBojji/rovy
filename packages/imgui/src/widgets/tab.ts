import { widget, __useInstance, __useState, useHoverTarget, useInputService } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2, v2 } from "../primitives";
import { isTopGuiTarget } from "./shared";

export interface TabOptions {
	selected?: boolean;
	disabled?: boolean;
	/** Labels always retain their measured width plus padding. */
	minimumWidth?: number;
}

export interface TabHandle {
	selected(): boolean;
	clicked(): boolean;
}

interface TabRefs {
	button: TextButton;
	underline: Frame;
	corner: UICorner;
	options?: TabOptions;
	onActivate?: () => void;
}

/** Internal renderer shared by standalone tabs and managed tab bars. */
export const renderTab = widget((text: string, options: TabOptions, onActivate?: () => void): TabHandle & { button: TextButton } => {
	const [clicked, setClicked] = __useState("tab:clicked", false);
	const [hovered, setHovered] = __useState("tab:hovered", false);
	const inputService = useInputService();
	const refs = __useInstance<TabRefs>("tab:instance", (ref) => {
		const target = ref as unknown as TabRefs;
		return create("TextButton", {
			[ref as never]: "button",
			Name: "Tab",
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
			AutoButtonColor: false,
			Font: Enum.Font.Code,
			0: create("UICorner", { [ref as never]: "corner" }),
			1: create("UIPadding", { PaddingLeft: udim(0, 10), PaddingRight: udim(0, 10) }),
			2: create("Frame", {
				[ref as never]: "underline",
				Name: "TabUnderline",
				BorderSizePixel: 0,
				AnchorPoint: v2(0, 1),
				Position: udim2(0, 0, 1, 0),
				Size: udim2(1, 0, 0, 2),
			}),
			Activated: () => {
				if (target.options?.disabled === true || !isTopGuiTarget(target.button, undefined, undefined, inputService)) return;
				setClicked(true);
				target.onActivate?.();
			},
		});
	});
	// Event handlers must read current options after labels, state, or callbacks change.
	refs.options = options;
	refs.onActivate = onActivate;
	useHoverTarget(refs.button, setHovered, `Tab: ${text}`);
	const style = useStyle();
	const selected = options.selected ?? false;
	const disabled = options.disabled ?? false;
	if (disabled && clicked) setClicked(false);
	const [ok, width] = pcall(() => game.GetService("TextService")
		.GetTextSize(text, style.textSize, Enum.Font.Code, v2(100000, style.itemHeight)).X);
	const textWidth = ok ? width as number : text.size() * style.textSize * 0.6;
	refs.button.Text = text;
	refs.button.TextSize = style.textSize;
	refs.button.Size = udim2(0, math.max(math.ceil(textWidth) + 20, options.minimumWidth ?? 0), 0, style.itemHeight);
	refs.button.Selectable = !disabled;
	refs.corner.CornerRadius = udim(0, style.cornerRadius);
	refs.underline.Visible = selected;
	refs.underline.BackgroundColor3 = disabled ? style.textDisabledColor : style.accentColor;
	refs.button.TextColor3 = disabled ? style.textDisabledColor : selected || hovered ? style.strongTextColor : style.textColor;
	refs.button.BackgroundColor3 = selected ? style.selectionBgColor : style.widgetHoveredBgColor;
	refs.button.BackgroundTransparency = disabled ? 1 : selected || hovered ? 0 : 1;
	let consumed = false;
	return {
		button: refs.button,
		selected() { return selected; },
		clicked() {
			if (!clicked || consumed || disabled) return false;
			consumed = true;
			setClicked(false);
			return true;
		},
	};
}, "@rovy/imgui/tab");

/** @widget */
export function tab(text: string, options: TabOptions = {}): TabHandle {
	return renderTab(text, options);
}
