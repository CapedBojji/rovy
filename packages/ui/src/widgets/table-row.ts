import { widget, __callWidget, __scope, __useInstance, useContext, provideContext } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2, v2 } from "../primitives";
import * as contexts from "../contexts";
import type { TableState } from "./table";
import { markHitTestPassThrough } from "./shared";

export interface TableRowOptions {
	header?: boolean;
}

export interface RowState {
	tableState: TableState;
	rowIndex: number;
	isHeader: boolean;
	nextColumn: number;
}

const tableRowWidget = widget((options: TableRowOptions, fn: () => void): void => {
	const tableState = useContext(contexts.tableState) as TableState | undefined;
	if (tableState === undefined) {
		error("EgooE.tableRow must be used inside EgooE.table", 2);
	}

	tableState.rowIndex += 1;
	const rowIndex = tableState.rowIndex;
	const isHeader =
		options.header !== undefined ? options.header : tableState.header && rowIndex === 1;

	const refs = __useInstance("tableRow:instance", (ref) => {
		const style = useStyle();
		return create("Frame", {
			[ref as never]: "frame",
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
			Size: udim2(1, 0, 0, 0),
			AutomaticSize: Enum.AutomaticSize.Y,
			2: create("UISizeConstraint", {
				[ref as never]: "minSize",
				MinSize: v2(0, tableState.rowHeight),
			}),
			0: create("Frame", {
				[ref as never]: "topDivider",
				BackgroundColor3: style.tableBorderColor,
				BackgroundTransparency: style.tableBorderTransparency,
				BorderSizePixel: 0,
				Size: udim2(1, 0, 0, 1),
				Visible: false,
				ZIndex: 5,
			}),
			1: create("Frame", {
				[ref as never]: "content",
				BackgroundTransparency: 1,
				BorderSizePixel: 0,
				Size: udim2(1, 0, 0, 0),
				AutomaticSize: Enum.AutomaticSize.Y,
				0: create("UIListLayout", {
					SortOrder: Enum.SortOrder.LayoutOrder,
					FillDirection: Enum.FillDirection.Horizontal,
					Padding: udim(0, 0),
				}),
			}),
		});
	}) as { frame: Frame; topDivider: Frame; content: Frame; minSize: UISizeConstraint };

	markHitTestPassThrough(refs.frame);
	markHitTestPassThrough(refs.topDivider);
	markHitTestPassThrough(refs.content);
	if (refs.minSize !== undefined) refs.minSize.MinSize = v2(0, tableState.rowHeight);
	refs.topDivider.Visible = tableState.borders && rowIndex > 1;
	refs.topDivider.BackgroundColor3 = tableState.borderColor;
	refs.topDivider.BackgroundTransparency = tableState.borderTransparency;

	const rowState: RowState = {
		tableState,
		rowIndex,
		isHeader,
		nextColumn: 1,
	};

	provideContext(contexts.tableRowState, rowState);
	const content = refs.content;
	__scope("tableRow:mount", () => {
		__useInstance("tableRow:portal", () => [undefined, content] as [Instance | undefined, Instance]);
		__scope("tableRow:children", fn);
	});
}, "@rovy/ui/tableRowWidget");

/** @widget */
export function tableRow(options: TableRowOptions, children: () => void): void;
export function tableRow(children: () => void): void;
export function tableRow(first: TableRowOptions | (() => void), second?: () => void): void {
	const fn = typeIs(first, "function") ? first : second;
	const options: TableRowOptions = typeIs(first, "function") ? {} : first;
	__callWidget("tableRow", tableRowWidget as (...args: unknown[]) => void, options, fn);
}
