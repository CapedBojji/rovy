import { widget } from "../runtime";
import { v2 } from "../primitives";
import { window } from "./window";

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

/** @widget */
export const childWindow = widget((options: string | ChildWindowOptions, children: () => void): ChildWindowHandle => {
	const opts = typeIs(options, "string") ? ({ title: options } as ChildWindowOptions) : options;
	const handle = window(
		{ title: opts.title, size: v2(260, opts.height ?? 180), minimizable: opts.minimizable },
		children,
	);
	return {
		minimized() {
			return handle.minimized();
		},
	};
}, "@rovy/ui/childWindow");
