import { widget, __scope, __useInstance, __useState } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim2 } from "../primitives";
import { textProps } from "./shared";

export interface WindowOptions {
	title?: string;
	closable?: boolean;
	minimizable?: boolean;
	movable?: boolean;
	resizable?: boolean;
	scrollX?: boolean;
	scrollY?: boolean;
	size?: Vector2;
	position?: Vector2;
}
export interface WindowHandle {
	closed(): boolean;
	minimized(): boolean;
}

/** @widget */
export const window = widget((options: string | WindowOptions, children: () => void): WindowHandle => {
	const opts = typeIs(options, "string") ? ({ title: options } as WindowOptions) : options;
	const [closed, setClosed] = __useState("window:closed", false);
	const [minimized, setMinimized] = __useState("window:minimized", false);
	const refs = __useInstance("window:instance", (ref) => {
		const style = useStyle();
		const root = create("Frame", {
			[ref as never]: "frame",
			BackgroundColor3: style.windowBgColor,
			BackgroundTransparency: style.windowBgTransparency,
			Size: udim2(0, opts.size?.X ?? 300, 0, opts.size?.Y ?? 400),
			Position: udim2(0, opts.position?.X ?? 60, 0, opts.position?.Y ?? 60),
			ClipsDescendants: false,
			0: create("TextLabel", { [ref as never]: "title", ...textProps(opts.title ?? "Window", style) }),
			1: create("Frame", {
				[ref as never]: "content",
				BackgroundTransparency: 1,
				Size: udim2(1, 0, 1, -style.titleBarHeight),
			}),
		});
		return [root, ref.content] as [Instance, Instance];
	}) as { frame: Frame; title: TextLabel; content: Frame };
	refs.title.Text = opts.title ?? "Window";
	__scope("window:children", children);
	return {
		closed() {
			if (!closed) return false;
			setClosed(false);
			return true;
		},
		minimized() {
			return minimized;
		},
	};
}, "@rovy/ui/window");
