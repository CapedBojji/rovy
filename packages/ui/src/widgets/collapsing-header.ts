import { widget, __scope, __useState } from "../runtime";
import { button } from "./button";

export interface CollapsingHeaderHandle {
	open(): boolean;
}

/** @widget */
export const collapsingHeader = widget((text: string, children: () => void): CollapsingHeaderHandle => {
	const [open, setOpen] = __useState("collapsing:open", true);
	const handle = button(`${open ? "v" : ">"} ${text}`);
	if (handle.clicked()) setOpen((value) => !value);
	if (open) __scope("collapsing:children", children);
	return {
		open() {
			return open;
		},
	};
}, "@rovy/ui/collapsingHeader");
