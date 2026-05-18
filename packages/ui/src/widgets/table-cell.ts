import { __scope } from "../runtime";

export interface TableCellOptions {
	column?: number;
}

/** @widget */
export function tableCell(children: () => void): void;
export function tableCell(options: TableCellOptions, children: () => void): void;
export function tableCell(first: TableCellOptions | (() => void), second?: () => void): void {
	const fn = typeIs(first, "function") ? first : second;
	if (fn) __scope("tableCell:children", fn);
}
