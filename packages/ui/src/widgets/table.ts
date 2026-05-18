import { widget, __scope, __useInstance } from "../runtime";
import { create } from "../create";
import { udim2 } from "../primitives";

export interface TableColumn {
	width?: number;
	fill?: boolean;
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
}

/** @widget */
const _table = widget((options: TableOptions, children: () => void): void => {
	__useInstance("table:instance", () =>
		create("Frame", { BackgroundTransparency: 1, Size: udim2(1, 0, 0, options.rowHeight ?? 120) }),
	);
	__scope("table:children", children);
}, "@rovy/ui/table");

export { _table as table };
