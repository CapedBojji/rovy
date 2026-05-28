import { widget, __useInstance, __useState, __useEffect, useRootInstance, useHoverTarget } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2, v2 } from "../primitives";
import { WINDOW_ATTRIBUTE } from "../windowConstants";
import { isTopGuiTarget, makeCorner, makeShadow, makeStroke } from "./shared";

export interface ComboBoxOptions {
	items: string[];
	selected?: string;
	label?: string;
}
export interface ComboBoxHandle {
	value(): string;
	changed(): boolean;
}

interface ComboBoxRefs {
	comboBtn: TextButton;
	stroke: UIStroke;
	arrow: TextLabel;
	dropdown?: ScrollingFrame;
	keyFocusIndex?: number;
	hoveredItem?: number;
}

const ARROW = "▼";
const ITEM_HEIGHT = 22;
const MAX_VISIBLE_ITEMS = 6;

function tryGetService(name: string): Instance | undefined {
	const [ok, svc] = pcall(() => game.GetService(name as keyof Services));
	return ok ? svc : undefined;
}

function findDropdownParent(comboBtn: GuiObject | undefined, rootGui: Instance | undefined): Instance | undefined {
	if (comboBtn !== undefined) {
		let ancestor = comboBtn.Parent;
		while (ancestor !== undefined) {
			if (ancestor.IsA("GuiObject") && ancestor.GetAttribute(WINDOW_ATTRIBUTE) === true) {
				return ancestor;
			}
			ancestor = ancestor.Parent;
		}
	}
	return rootGui;
}

function toParentPosition(guiObject: GuiObject, parentInstance: Instance): Vector2 {
	const absolutePosition = guiObject.AbsolutePosition;
	if (parentInstance.IsA("GuiBase2d")) {
		return absolutePosition.sub((parentInstance as GuiBase2d).AbsolutePosition);
	}
	return absolutePosition;
}

/** @widget */
export const comboBox = widget((options: ComboBoxOptions): ComboBoxHandle => {
	const opts = options ?? ({} as ComboBoxOptions);
	const items = opts.items ?? [];
	const initialSelected = opts.selected ?? (items[0] ?? "");

	const [selectedValue, setSelectedValue] = __useState("comboBox:value", initialSelected);
	let initialIndex: number | undefined = undefined;
	for (let i = 1; i <= items.size(); i++) {
		if (items[i - 1] === initialSelected) {
			initialIndex = i;
			break;
		}
	}
	const [selectedIndex, setSelectedIndex] = __useState<number | undefined>("comboBox:index", initialIndex);
	const [changed, setChanged] = __useState("comboBox:changed", false);
	const [isOpen, setIsOpen] = __useState("comboBox:open", false);
	const [hovered, setHovered] = __useState("comboBox:hovered", false);

	if (opts.selected !== undefined && opts.selected !== selectedValue) {
		for (let idx = 1; idx <= items.size(); idx++) {
			if (items[idx - 1] === opts.selected) {
				setSelectedValue(opts.selected);
				setSelectedIndex(idx);
				break;
			}
		}
	}

	const refs = __useInstance("comboBox:instance", (rawRef) => {
		const style = useStyle();
		const targetRef = rawRef as unknown as ComboBoxRefs;
		return create("TextButton", {
			[rawRef as never]: "comboBtn",
			BackgroundColor3: style.widgetInactiveBgColor,
			BackgroundTransparency: 0,
			BorderSizePixel: 0,
			Font: Enum.Font.Code,
			TextColor3: style.textColor,
			TextSize: style.textSize,
			TextXAlignment: Enum.TextXAlignment.Left,
			Size: udim2(1, 0, 0, style.itemHeight),
			AutoButtonColor: false,
			0: makeCorner(style.cornerRadius),
			1: (() => {
				const stroke = makeStroke(style);
				(rawRef as unknown as Record<string, unknown>).stroke = stroke;
				return stroke;
			})(),
			2: create("UIPadding", {
				PaddingLeft: udim(0, 6),
				PaddingRight: udim(0, 6),
			}),
			3: create("TextLabel", {
				[rawRef as never]: "arrow",
				BackgroundTransparency: 1,
				Font: Enum.Font.Code,
				TextColor3: style.weakTextColor,
				TextSize: style.textSize,
				TextXAlignment: Enum.TextXAlignment.Right,
				AnchorPoint: v2(1, 0.5),
				Position: udim2(1, -6, 0.5, 0),
				Size: udim2(0, 16, 1, 0),
				Text: ARROW,
				ZIndex: 2,
				}),
				Activated: () => {
					if (!isTopGuiTarget(targetRef.comboBtn)) return;
					setIsOpen((v) => !v);
				},
		});
	}) as unknown as ComboBoxRefs;

	useHoverTarget(refs.comboBtn, setHovered, `ComboBox: ${selectedValue}`);

	__useEffect("comboBox:dropdown", () => {
		const rootGui = useRootInstance();
		if (rootGui === undefined) return;

		const style = useStyle();

		const dropdown = new Instance("ScrollingFrame");
		dropdown.Name = "ComboDropdown";
		dropdown.BackgroundColor3 = style.popupBgColor;
		dropdown.BackgroundTransparency = 0;
		dropdown.BorderSizePixel = 0;
		dropdown.Active = true;
		dropdown.Size = udim2(0, 160, 0, 0);
		dropdown.CanvasSize = udim2(0, 0, 0, 0);
		dropdown.ScrollingEnabled = true;
		dropdown.ScrollBarThickness = 0;
		dropdown.ScrollBarImageColor3 = style.sliderGrabColor;
		dropdown.AutomaticSize = Enum.AutomaticSize.None;
		dropdown.ZIndex = 250;
		dropdown.Visible = false;
		dropdown.Parent = rootGui;

		makeCorner(style.menuCornerRadius).Parent = dropdown;
		makeStroke(style).Parent = dropdown;
		const shadow = makeShadow(style);
		if (shadow !== undefined) shadow.Parent = dropdown;

		const list = new Instance("UIListLayout");
		list.SortOrder = Enum.SortOrder.LayoutOrder;
		list.Padding = udim(0, 0);
		list.Parent = dropdown;

		refs.dropdown = dropdown;

		return () => {
			if (dropdown !== undefined && dropdown.Parent !== undefined) dropdown.Destroy();
			refs.dropdown = undefined;
		};
	});

	__useEffect(
		"comboBox:keyboard",
		() => {
			if (!isOpen) {
				refs.keyFocusIndex = undefined;
				return;
			}

			refs.keyFocusIndex = selectedIndex;

			const UserInputService = tryGetService("UserInputService") as UserInputService | undefined;
			if (UserInputService === undefined) return;

			const conn = UserInputService.InputBegan.Connect((...args: ReadonlyArray<unknown>) => {
				const input = args[0] as InputObject;

				if (
					input.UserInputType === Enum.UserInputType.MouseButton1 ||
					input.UserInputType === Enum.UserInputType.MouseButton2 ||
					input.UserInputType === Enum.UserInputType.Touch
				) {
					const pos = input.Position;
					const insideBtn = (() => {
						const btn = refs.comboBtn;
						if (btn === undefined) return false;
						const a = btn.AbsolutePosition;
						const s = btn.AbsoluteSize;
						return pos.X >= a.X && pos.X <= a.X + s.X && pos.Y >= a.Y && pos.Y <= a.Y + s.Y;
					})();
					const insideDropdown = (() => {
						const dd = refs.dropdown;
						if (dd === undefined || !dd.Visible) return false;
						const a = dd.AbsolutePosition;
						const s = dd.AbsoluteSize;
						return pos.X >= a.X && pos.X <= a.X + s.X && pos.Y >= a.Y && pos.Y <= a.Y + s.Y;
					})();
					if (!insideBtn && !insideDropdown) {
						setIsOpen(false);
					}
					return;
				}

				if (input.UserInputType !== Enum.UserInputType.Keyboard) return;

				const current = refs.keyFocusIndex ?? selectedIndex ?? 1;

				if (input.KeyCode === Enum.KeyCode.Down) {
					const nextIdx = math.clamp(current + 1, 1, items.size());
					refs.keyFocusIndex = nextIdx;
					if (refs.dropdown !== undefined) {
						const totalH = items.size() * ITEM_HEIGHT;
						const maxH = math.min(totalH, MAX_VISIBLE_ITEMS * ITEM_HEIGHT);
						const scrollY = math.clamp(
							(nextIdx - 1) * ITEM_HEIGHT - math.floor(maxH / ITEM_HEIGHT / 2) * ITEM_HEIGHT,
							0,
							totalH - maxH,
						);
						refs.dropdown.CanvasPosition = v2(0, scrollY);
					}
				} else if (input.KeyCode === Enum.KeyCode.Up) {
					const prev = math.clamp(current - 1, 1, items.size());
					refs.keyFocusIndex = prev;
					if (refs.dropdown !== undefined) {
						const totalH = items.size() * ITEM_HEIGHT;
						const maxH = math.min(totalH, MAX_VISIBLE_ITEMS * ITEM_HEIGHT);
						const scrollY = math.clamp(
							(prev - 1) * ITEM_HEIGHT - math.floor(maxH / ITEM_HEIGHT / 2) * ITEM_HEIGHT,
							0,
							totalH - maxH,
						);
						refs.dropdown.CanvasPosition = v2(0, scrollY);
					}
				} else if (input.KeyCode === Enum.KeyCode.Return || input.KeyCode === Enum.KeyCode.KeypadEnter) {
					const idx = refs.keyFocusIndex;
					if (idx !== undefined && items[idx - 1] !== undefined) {
						setSelectedValue(items[idx - 1]);
						setSelectedIndex(idx);
						setChanged(true);
						setIsOpen(false);
					}
				} else if (input.KeyCode === Enum.KeyCode.Escape) {
					setIsOpen(false);
				}
			});

			return () => {
				conn.Disconnect();
				refs.keyFocusIndex = undefined;
			};
		},
		isOpen,
	);

	const rootGui = useRootInstance();
	const style = useStyle();

	refs.comboBtn.Text = ` ${selectedValue}`;
	refs.comboBtn.TextSize = style.textSize;
	refs.comboBtn.TextColor3 = style.textColor;

	if (isOpen) {
		refs.comboBtn.BackgroundColor3 = style.widgetActiveBgColor;
		refs.comboBtn.BackgroundTransparency = 0;
		refs.stroke.Color = style.strokeActiveColor;
		refs.stroke.Transparency = style.strokeActiveTransparency;
	} else if (hovered) {
		refs.comboBtn.BackgroundColor3 = style.widgetHoveredBgColor;
		refs.comboBtn.BackgroundTransparency = 0;
		refs.stroke.Color = style.strokeHoveredColor;
		refs.stroke.Transparency = style.strokeHoveredTransparency;
	} else {
		refs.comboBtn.BackgroundColor3 = style.widgetInactiveBgColor;
		refs.comboBtn.BackgroundTransparency = 0;
		refs.stroke.Color = style.strokeInactiveColor;
		refs.stroke.Transparency = style.strokeInactiveTransparency;
	}

	if (!isOpen) refs.hoveredItem = undefined;

	if (refs.dropdown !== undefined) {
		if (!isOpen && rootGui !== undefined && refs.dropdown.Parent !== rootGui) {
			refs.dropdown.Parent = rootGui;
		}

		refs.dropdown.Visible = isOpen;

		if (isOpen) {
			const dropdownParent = findDropdownParent(refs.comboBtn, rootGui);
			if (dropdownParent !== undefined && refs.dropdown.Parent !== dropdownParent) {
				refs.dropdown.Parent = dropdownParent;
			}

			const absSize = refs.comboBtn.AbsoluteSize;
			const localPos =
				dropdownParent !== undefined
					? toParentPosition(refs.comboBtn, dropdownParent)
					: refs.comboBtn.AbsolutePosition;

			const totalH = items.size() * ITEM_HEIGHT;
			const maxH = math.min(totalH, MAX_VISIBLE_ITEMS * ITEM_HEIGHT);

			refs.dropdown.Position = udim2(0, localPos.X, 0, localPos.Y + absSize.Y + 2);
			refs.dropdown.Size = udim2(0, absSize.X, 0, maxH);
			refs.dropdown.CanvasSize = udim2(0, 0, 0, totalH);

			let existingCount = 0;
			for (const child of refs.dropdown.GetChildren()) {
				if (child.IsA("TextButton")) existingCount += 1;
			}
			if (existingCount !== items.size()) {
				for (const child of refs.dropdown.GetChildren()) {
					if (child.IsA("TextButton")) child.Destroy();
				}

				for (let i = 1; i <= items.size(); i++) {
					const item = items[i - 1];
					const itemBtn = new Instance("TextButton");
					itemBtn.Name = `Item_${i}`;
					itemBtn.BorderSizePixel = 0;
					itemBtn.Font = Enum.Font.Code;
					itemBtn.TextColor3 = style.textColor;
					itemBtn.TextSize = style.textSize;
					itemBtn.TextXAlignment = Enum.TextXAlignment.Left;
					itemBtn.Size = udim2(1, 0, 0, ITEM_HEIGHT);
					itemBtn.ZIndex = 251;
					itemBtn.AutoButtonColor = false;
					itemBtn.LayoutOrder = i;
					itemBtn.Parent = refs.dropdown;

					const itemPadding = new Instance("UIPadding");
					itemPadding.PaddingLeft = udim(0, 8);
					itemPadding.PaddingRight = udim(0, 8);
					itemPadding.Parent = itemBtn;

						const capturedIndex = i;
						const capturedItem = item;
						itemBtn.Activated.Connect(() => {
							if (!isTopGuiTarget(itemBtn)) return;
							setSelectedValue(capturedItem);
							setSelectedIndex(capturedIndex);
						setChanged(true);
						setIsOpen(false);
					});

					itemBtn.Text = capturedItem;
				}
			}

				for (const child of refs.dropdown.GetChildren()) {
					if (child.IsA("TextButton")) {
						const childIndex = child.LayoutOrder;
							useHoverTarget(child as TextButton, (value) => {
								if (value) refs.hoveredItem = childIndex;
								else if (refs.hoveredItem === childIndex) refs.hoveredItem = undefined;
							}, `ComboBox item: ${(child as TextButton).Text}`);
						const isSelected = childIndex === selectedIndex;
					const isHoveredItem = refs.hoveredItem === childIndex;
					const isKeyFocused = refs.keyFocusIndex !== undefined && childIndex === refs.keyFocusIndex;
					if (isSelected) {
						child.BackgroundColor3 = style.selectionBgColor;
						child.BackgroundTransparency = 0;
					} else if (isHoveredItem || isKeyFocused) {
						child.BackgroundColor3 = style.widgetHoveredBgColor;
						child.BackgroundTransparency = 0;
					} else {
						child.BackgroundColor3 = style.popupBgColor;
						child.BackgroundTransparency = 1;
					}
				}
			}
		}
	}

	return {
		value() {
			return selectedValue;
		},
		changed() {
			if (changed) {
				setChanged(false);
				return true;
			}
			return false;
		},
	};
}, "@rovy/ui/comboBox");
