import { row } from "./row";

export interface TableRowOptions {
	header?: boolean;
}

/** @widget */
export function tableRow(children: () => void): void;
export function tableRow(options: TableRowOptions, children: () => void): void;
export function tableRow(first: TableRowOptions | (() => void), second?: () => void): void {
	const fn = typeIs(first, "function") ? first : second;
	if (fn) row(fn);
}
