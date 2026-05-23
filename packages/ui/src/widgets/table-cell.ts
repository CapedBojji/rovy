import { widget, __callWidget, __scope, __useInstance, useContext, provideContext } from "../runtime";
import { create } from "../create";
import { udim, udim2 } from "../primitives";
import * as contexts from "../contexts";
import type { TableState } from "./table";
import type { RowState } from "./table-row";

export interface TableCellOptions {
	column?: number;
}

function getCellBackground(
	tableState: TableState,
	rowState: RowState,
	columnIndex: number,
): [Color3, number] {
	if (rowState.isHeader) {
		return [tableState.headerColor, tableState.headerTransparency];
	}

	const bodyRowIndex = tableState.header ? rowState.rowIndex - 1 : rowState.rowIndex;
	if (tableState.stripeRows && bodyRowIndex > 0 && bodyRowIndex % 2 === 0) {
		return [tableState.stripeRowColor, tableState.stripeRowTransparency];
	}

	if (tableState.stripeColumns && columnIndex % 2 === 0) {
		return [tableState.stripeColumnColor, tableState.stripeColumnTransparency];
	}

	return [tableState.headerColor, 1];
}

const tableCellWidget = widget((options: TableCellOptions, fn: () => void): void => {
	const rowState = useContext(contexts.tableRowState) as RowState | undefined;
	if (rowState === undefined) {
		error("EgooE.tableCell must be used inside EgooE.tableRow", 2);
	}

	const tableState = rowState.tableState;
	const columnIndex = math.max(options.column ?? rowState.nextColumn, rowState.nextColumn);
	rowState.nextColumn = columnIndex + 1;

	const cellWidth = tableState.columnWidths[columnIndex - 1] ?? 0;
	const [cellColor, cellTransparency] = getCellBackground(tableState, rowState, columnIndex);

	const refs = __useInstance("tableCell:instance", (ref) => {
		const cellFrame = create("Frame", {
			[ref as never]: "frame",
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
			ClipsDescendants: true,
			Size: udim2(0, cellWidth, 1, 0),
			0: create("Frame", {
				[ref as never]: "background",
				BackgroundTransparency: 1,
				BorderSizePixel: 0,
				Size: udim2(1, 0, 1, 0),
			}),
			1: create("Frame", {
				[ref as never]: "leftDivider",
				BackgroundTransparency: 1,
				BorderSizePixel: 0,
				Position: udim2(0, 0, 0, 0),
				Size: udim2(0, 1, 1, 0),
				ZIndex: 5,
			}),
			2: create("Frame", {
				[ref as never]: "content",
				BackgroundTransparency: 1,
				BorderSizePixel: 0,
				Size: udim2(1, 0, 1, 0),
				0: create("UIListLayout", {
					[ref as never]: "layout",
					SortOrder: Enum.SortOrder.LayoutOrder,
					Padding: udim(0, 2),
					HorizontalAlignment: Enum.HorizontalAlignment.Center,
					VerticalAlignment: Enum.VerticalAlignment.Center,
				}),
				1: create("UIPadding", { [ref as never]: "padding" }),
			}),
		});
		return [cellFrame, ref.content] as [Instance, Instance];
	}) as { frame: Frame; background: Frame; leftDivider: Frame; content: Frame; layout: UIListLayout; padding: UIPadding };

	refs.frame.Size = udim2(0, cellWidth, 1, 0);
	refs.background.BackgroundColor3 = cellColor;
	refs.background.BackgroundTransparency = cellTransparency;

	refs.leftDivider.Visible = tableState.borders && columnIndex > 1;
	refs.leftDivider.BackgroundColor3 = tableState.borderColor;
	refs.leftDivider.BackgroundTransparency = tableState.borderTransparency;

	refs.padding.PaddingLeft = udim(0, tableState.cellPadding.X);
	refs.padding.PaddingRight = udim(0, tableState.cellPadding.X);
	refs.padding.PaddingTop = udim(0, tableState.cellPadding.Y);
	refs.padding.PaddingBottom = udim(0, tableState.cellPadding.Y);

	provideContext(contexts.tableCellState, { centered: true });
	__scope("tableCell:children", fn);
}, "@rovy/ui/tableCellWidget");

/** @widget */
export function tableCell(options: TableCellOptions, children: () => void): void;
export function tableCell(children: () => void): void;
export function tableCell(first: TableCellOptions | (() => void), second?: () => void): void {
	const fn = typeIs(first, "function") ? first : second;
	const options: TableCellOptions = typeIs(first, "function") ? {} : first;
	__callWidget("tableCell", tableCellWidget as (...args: unknown[]) => void, options, fn);
}
