import { widget } from "../runtime";
import { window } from "./window";

export interface ModalOptions {
	title?: string;
	open?: boolean;
	closable?: boolean;
}
export interface ModalHandle {
	closed(): boolean;
}

/** @widget */
export const modal = widget((options: string | ModalOptions, children: () => void): ModalHandle => {
	const opts = typeIs(options, "string") ? ({ title: options } as ModalOptions) : options;
	if (opts.open === false) {
		return {
			closed() {
				return false;
			},
		};
	}
	const handle = window({ title: opts.title ?? "Modal", closable: opts.closable }, children);
	return {
		closed() {
			return handle.closed();
		},
	};
}, "@rovy/ui/modal");
