import { widget, __callWidget, __scope, __useInstance, __useState, provideContext } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2 } from "../primitives";
import * as contexts from "../contexts";
import { markHitTestPassThrough } from "./shared";

export interface TableColumn {
	width?: number;
	fill?: boolean;
	auto?: boolean;
	minWidth?: number;
}
export interface TableOptions {
	columns?: TableColumn[];
	header?: boolean;
	rowHeight?: number;
	cellPadding?: Vector2;
	borders?: boolean;
	stripeRows?: boolean;
	stripeColumns?: boolean;
	stripeRowColor?: Color3;
	stripeColumnColor?: Color3;
	stripeRowTransparency?: number;
	stripeColumnTransparency?: number;
	/** Keep columns at their natural width and scroll horizontally when the table is narrower than its content. */
	scrollX?: boolean;
}

export interface TableState {
	columns: TableColumn[];
	columnWidths: number[];
	autoColumnWidths: number[];
	measuredAutoColumnWidths: number[];
	setAutoColumnWidth: (columnIndex: number, width: number) => void;
	rowHeight: number;
	cellPadding: Vector2;
	borders: boolean;
	header: boolean;
	stripeRows: boolean;
	stripeColumns: boolean;
	stripeRowColor: Color3;
	stripeColumnColor: Color3;
	stripeRowTransparency: number;
	stripeColumnTransparency: number;
	headerColor: Color3;
	headerTransparency: number;
	borderColor: Color3;
	borderTransparency: number;
	rowIndex: number;
	scrollX: boolean;
	contentWidth: number;
}

function normalizeColumns(columns?: TableColumn[]): TableColumn[] {
	if (columns !== undefined && columns.size() > 0) return columns;
	return [{ fill: true }];
}

function normalizeAutoColumnWidths(columns: TableColumn[], previous?: number[]): number[] {
	const widths = new Array<number>(columns.size());
	for (let index = 0; index < columns.size(); index++) {
		const minWidth = columns[index].minWidth ?? 0;
		widths[index] = math.max(previous?.[index] ?? 0, minWidth);
	}
	return widths;
}

function copyWidths(widths: number[]): number[] {
	const copy = new Array<number>(widths.size());
	for (let index = 0; index < widths.size(); index++) {
		copy[index] = widths[index];
	}
	return copy;
}

function computeColumnWidths(totalWidth: number, columns: TableColumn[], autoColumnWidths: number[]): number[] {
	const widths = new Array<number>(columns.size());
	let fixedWidth = 0;
	let fillCount = 0;

	for (let index = 0; index < columns.size(); index++) {
		const column = columns[index];
		if (column.auto === true) {
			const reservedWidth = math.max(autoColumnWidths[index] ?? 0, column.minWidth ?? 0);
			widths[index] = reservedWidth;
			fixedWidth += reservedWidth;
			continue;
		}
		const width = column.width ?? 0;
		widths[index] = width;
		fixedWidth += width;
		if (column.fill === true || width <= 0) fillCount += 1;
	}

	const remainingWidth = math.max(0, totalWidth - fixedWidth);
	const fillWidth = fillCount > 0 ? remainingWidth / fillCount : 0;

	for (let index = 0; index < columns.size(); index++) {
		const column = columns[index];
		if (column.auto === true) continue;
		if (column.fill === true || (column.width ?? 0) <= 0) widths[index] = fillWidth;
	}

	return widths;
}

/** Smallest total width the table can occupy before columns must scroll instead of shrink. */
function columnMinTotal(columns: TableColumn[], autoColumnWidths: number[]): number {
	let total = 0;
	for (let index = 0; index < columns.size(); index++) {
		const column = columns[index];
		if (column.auto === true) {
			total += math.max(autoColumnWidths[index] ?? 0, column.minWidth ?? 0);
		} else if (column.fill === true || (column.width ?? 0) <= 0) {
			total += column.minWidth ?? 0;
		} else {
			total += column.width ?? 0;
		}
	}
	return total;
}

function sumWidths(widths: number[]): number {
	let total = 0;
	for (const width of widths) total += width;
	return total;
}

const tableWidget = widget((options: TableOptions, fn: () => void): void => {
	const scrollX = options.scrollX ?? false;
	const refs = __useInstance("table:instance", (ref) => {
		const style = useStyle();
		const border = create("UIStroke", {
			[ref as never]: "border",
			Color: style.tableBorderColor,
			Transparency: style.tableBorderTransparency,
			Thickness: 1,
			Enabled: false,
		});
		const layout = create("UIListLayout", {
			SortOrder: Enum.SortOrder.LayoutOrder,
			Padding: udim(0, 0),
		});
		if (scrollX) {
			return create("ScrollingFrame", {
				[ref as never]: "frame",
				BackgroundTransparency: 1,
				BorderSizePixel: 0,
				Size: udim2(1, 0, 0, 0),
				AutomaticSize: Enum.AutomaticSize.Y,
				ClipsDescendants: true,
				ScrollingDirection: Enum.ScrollingDirection.X,
				ScrollBarThickness: style.scrollbarSize,
				ScrollBarImageColor3: style.scrollbarGrabColor,
				HorizontalScrollBarInset: Enum.ScrollBarInset.ScrollBar,
				CanvasSize: udim2(0, 0, 0, 0),
				AutomaticCanvasSize: Enum.AutomaticSize.X,
				0: border,
				1: layout,
			});
		}
		return create("Frame", {
			[ref as never]: "frame",
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
			Size: udim2(1, 0, 0, 0),
			AutomaticSize: Enum.AutomaticSize.Y,
			ClipsDescendants: true,
			0: border,
			1: layout,
		});
	}) as { frame: GuiObject; border: UIStroke };

	const style = useStyle();
	markHitTestPassThrough(refs.frame);
	const columns = normalizeColumns(options.columns);
	const [storedAutoColumnWidths, setStoredAutoColumnWidths] = __useState("table:autoColumnWidths", () =>
		normalizeAutoColumnWidths(columns),
	);
	const autoColumnWidths = normalizeAutoColumnWidths(columns, storedAutoColumnWidths);
	let absoluteWidth = refs.frame.AbsoluteSize.X;

	const parent = refs.frame.Parent;
	if (absoluteWidth <= 0 && parent !== undefined && parent.IsA("GuiObject")) {
		absoluteWidth = parent.AbsoluteSize.X;
	}
	if (absoluteWidth <= 0) absoluteWidth = 300;

	const layoutWidth = scrollX ? math.max(absoluteWidth, columnMinTotal(columns, autoColumnWidths)) : absoluteWidth;
	const columnWidths = computeColumnWidths(layoutWidth, columns, autoColumnWidths);

	const tableState: TableState = {
		columns,
		columnWidths,
		autoColumnWidths,
		measuredAutoColumnWidths: copyWidths(autoColumnWidths),
		setAutoColumnWidth: (columnIndex: number, width: number): void => {
			const arrayIndex = columnIndex - 1;
			const currentWidth = tableState.measuredAutoColumnWidths[arrayIndex] ?? 0;
			if (width > currentWidth) tableState.measuredAutoColumnWidths[arrayIndex] = width;
		},
		rowHeight: options.rowHeight ?? style.tableRowHeight ?? style.itemHeight,
		cellPadding: options.cellPadding ?? style.tableCellPadding ?? style.framePadding,
		borders: options.borders ?? false,
		header: options.header ?? false,
		stripeRows: options.stripeRows ?? false,
		stripeColumns: options.stripeColumns ?? false,
		stripeRowColor: options.stripeRowColor ?? style.tableStripeRowColor,
		stripeColumnColor: options.stripeColumnColor ?? style.tableStripeColumnColor,
		stripeRowTransparency:
			options.stripeRowTransparency !== undefined
				? options.stripeRowTransparency
				: style.tableStripeRowTransparency,
		stripeColumnTransparency:
			options.stripeColumnTransparency !== undefined
				? options.stripeColumnTransparency
				: style.tableStripeColumnTransparency,
		headerColor: style.tableHeaderColor,
		headerTransparency: style.tableHeaderTransparency,
		borderColor: style.tableBorderColor,
		borderTransparency: style.tableBorderTransparency,
		rowIndex: 0,
		scrollX,
		contentWidth: sumWidths(columnWidths),
	};

	refs.border.Enabled = tableState.borders;
	refs.border.Color = tableState.borderColor;
	refs.border.Transparency = tableState.borderTransparency;

	provideContext(contexts.tableState, tableState);
	__scope("table:children", fn);

	let autoWidthsChanged = autoColumnWidths.size() !== tableState.measuredAutoColumnWidths.size();
	if (!autoWidthsChanged) {
		for (let index = 0; index < autoColumnWidths.size(); index++) {
			if ((autoColumnWidths[index] ?? 0) !== (tableState.measuredAutoColumnWidths[index] ?? 0)) {
				autoWidthsChanged = true;
				break;
			}
		}
	}
	if (autoWidthsChanged) setStoredAutoColumnWidths(tableState.measuredAutoColumnWidths);
}, "@rovy/ui/tableWidget");

/** @widget */
export function uiTable(options: TableOptions, children: () => void): void;
export function uiTable(children: () => void): void;
export function uiTable(first: TableOptions | (() => void), second?: () => void): void {
	const fn = typeIs(first, "function") ? first : second;
	const options: TableOptions = typeIs(first, "function") ? {} : first;
	__callWidget("table", tableWidget as (...args: unknown[]) => void, options, fn);
}
