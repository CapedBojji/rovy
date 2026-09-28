import { widget, __scope, __useState, __useEffect, useInputService } from "../runtime";
import { useStyle } from "../style";
import { udim2, v2 } from "../primitives";
import { row } from "./row";
import { renderTab } from "./tab";
import { isTopGuiTarget } from "./shared";

export interface TabItem {
	/** Unique, stable identity; labels may change without resetting selection. */
	id: string;
	label: string;
	disabled?: boolean;
}

export interface TabBarOptions {
	tabs: ReadonlyArray<TabItem>;
	/** External selection. Adopt selected() when changed() reports user input. */
	selected?: string;
	/** Initial selection for an internally managed bar. */
	initial?: string;
	padding?: number;
	minimumWidth?: number;
	/** Horizontal overflow scrolling, enabled by default. */
	scrollX?: boolean;
}

export interface TabBarHandle {
	/** Effective selection, including user input from the previous frame. */
	selected(): string | undefined;
	/** Consumed once per frame; includes fallback when the active tab disappears. */
	changed(): boolean;
}

interface BarState {
	selected?: string;
	pending?: string;
	initialized: boolean;
	buttons: Array<{ id: string; button: TextButton }>;
}

function visible(button: GuiObject): boolean {
	let current: Instance | undefined = button;
	while (current !== undefined) {
		if (current.IsA("GuiObject") && (current as GuiObject).Visible === false) return false;
		if (current.IsA("ScreenGui") && (current as ScreenGui).Enabled === false) return false;
		current = current.Parent;
	}
	return true;
}

function reveal(button: TextButton): void {
	const parent = button.Parent;
	if (parent === undefined || !parent.IsA("ScrollingFrame") || parent.AbsoluteSize.X <= 0) return;
	const left = button.AbsolutePosition.X - parent.AbsolutePosition.X + parent.CanvasPosition.X;
	const right = left + button.AbsoluteSize.X;
	if (left < parent.CanvasPosition.X) parent.CanvasPosition = v2(math.max(0, left), 0);
	else if (right > parent.CanvasPosition.X + parent.AbsoluteSize.X) {
		parent.CanvasPosition = v2(math.max(0, right - parent.AbsoluteSize.X), 0);
	}
}

/** @widget */
export const tabBar = widget((options: TabBarOptions, children?: (selected: string) => void): TabBarHandle => {
	const ids = new Set<string>();
	const enabled = new Set<string>();
	let first: string | undefined;
	for (const item of options.tabs) {
		assert(!ids.has(item.id), `[rovy-imgui] duplicate tab id: ${item.id}`);
		ids.add(item.id);
		if (!item.disabled) {
			enabled.add(item.id);
			first = first ?? item.id;
		}
	}
	const [state] = __useState<BarState>("tabBar:state", () => ({ initialized: false, buttons: [] }));
	const candidate = state.pending ?? options.selected ?? (state.initialized ? state.selected : options.initial);
	const selected = candidate !== undefined && enabled.has(candidate) ? candidate : first;
	let changed = state.initialized && selected !== state.selected;
	state.pending = undefined;
	state.selected = selected;
	state.initialized = true;
	state.buttons = [];
	const inputService = useInputService();
	const [guiOk, gui] = pcall(() => game.GetService("GuiService"));
	const guiService = guiOk ? gui as GuiService : undefined;
	const style = useStyle();
	const scrollX = options.scrollX ?? true;
	__scope(scrollX ? "tabBar:scroll" : "tabBar:row", () => {
		row({ padding: options.padding ?? 4, scrollX }, () => {
			for (const item of options.tabs) {
				__scope(`tabBar:item:${item.id}`, () => {
					const handle = renderTab(item.label, {
						selected: selected === item.id,
						disabled: item.disabled,
						minimumWidth: options.minimumWidth,
					}, () => {
						state.pending = item.id;
						if (guiService !== undefined) guiService.SelectedObject = handle.button;
					});
					const parent = handle.button.Parent as GuiObject;
					parent.Name = "TabBar";
					parent.Size = udim2(1, 0, 0, style.itemHeight + (scrollX ? style.scrollbarSize : 0));
					if (parent.IsA("ScrollingFrame")) {
						parent.ScrollBarThickness = style.scrollbarSize;
						parent.ScrollBarImageColor3 = style.scrollbarGrabColor;
					}
					if (!item.disabled) state.buttons.push({ id: item.id, button: handle.button });
				});
			}
		});
	});
	__useEffect("tabBar:keyboard", () => {
		if (inputService === undefined || guiService === undefined) return;
		const connection = inputService.InputBegan.Connect((input, processed) => {
			if (processed || input.UserInputType !== Enum.UserInputType.Keyboard) return;
			const focused = guiService.SelectedObject;
			const index = state.buttons.findIndex((entry) => entry.button === focused);
			if (index < 0 || focused === undefined || !visible(focused)) return;
			// Focus alone must not activate a bar underneath another window or modal.
			const center = v2(focused.AbsolutePosition.X + focused.AbsoluteSize.X * 0.5,
				focused.AbsolutePosition.Y + focused.AbsoluteSize.Y * 0.5);
			if (!isTopGuiTarget(focused, center.X, center.Y, inputService)) return;
			let nextIndex = index;
			if (input.KeyCode === Enum.KeyCode.Right) nextIndex = (index + 1) % state.buttons.size();
			else if (input.KeyCode === Enum.KeyCode.Left) nextIndex = (index + state.buttons.size() - 1) % state.buttons.size();
			else if (input.KeyCode === Enum.KeyCode.Home) nextIndex = 0;
			else if (input.KeyCode === Enum.KeyCode.End) nextIndex = state.buttons.size() - 1;
			else return;
			const entry = state.buttons[nextIndex];
			state.pending = entry.id;
			guiService.SelectedObject = entry.button;
		});
		return () => connection.Disconnect();
	}, inputService, guiService);
	if (changed) {
		const entry = state.buttons.find((entry) => entry.id === selected);
		if (entry !== undefined) reveal(entry.button);
	}
	if (selected !== undefined && children !== undefined) {
		__scope(`tabBar:content:${selected}`, () => children(selected));
	}
	return {
		selected() { return selected; },
		changed() {
			const result = changed;
			changed = false;
			return result;
		},
	};
}, "@rovy/imgui/tabBar");
