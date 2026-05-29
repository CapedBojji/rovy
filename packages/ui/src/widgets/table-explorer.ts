import { widget, __useState, __scope, useKey } from "../runtime";
import { v2 } from "../primitives";
import { window } from "./window";
import { row } from "./row";
import { button } from "./button";
import { input } from "./input";
import { label } from "./label";
import { separator } from "./separator";
import { uiTable } from "./table";
import { tableRow } from "./table-row";
import { tableCell } from "./table-cell";

export interface TableExplorerNode {
	readonly key: string;
	readonly typeLabel: string;
	readonly preview: string;
	readonly children?: ReadonlyArray<TableExplorerNode>;
	readonly truncated?: boolean;
	readonly cycle?: boolean;
}

export interface TableExplorerOptions {
	readonly title?: string;
	readonly onClose?: () => void;
}

export interface TableExplorerHandle {
	closed(): boolean;
}

/** Walk `rows` following `path` (relative keys) and return the node's children at that path. */
function rowsAtPath(
	rows: ReadonlyArray<TableExplorerNode>,
	path: ReadonlyArray<string>,
): ReadonlyArray<TableExplorerNode> {
	let current = rows;
	for (const segment of path) {
		let descended: ReadonlyArray<TableExplorerNode> | undefined;
		for (const node of current) {
			if (node.key === segment) {
				descended = node.children;
				break;
			}
		}
		if (descended === undefined) return [];
		current = descended;
	}
	return current;
}

function isExpandable(node: TableExplorerNode): boolean {
	return node.children !== undefined && node.children.size() > 0;
}

/**
 * View-only navigable table viewer over a hierarchical value tree. Owns its own
 * navigation state (breadcrumb path + key filter); the caller passes the root rows.
 */
export const tableExplorer = widget(
	(rows: ReadonlyArray<TableExplorerNode>, options?: TableExplorerOptions): TableExplorerHandle => {
		const [path, setPath] = __useState<Array<string>>("path", []);
		const [search, setSearch] = __useState("search", "");

		const handle = window(
			{
				title: options?.title ?? "Table",
				closable: true,
				minimizable: true,
				resizable: true,
				scrollY: true,
				size: v2(440, 360),
				onClose: options?.onClose,
			},
			() => {
				row({ scrollX: true }, () => {
					if (button("root").clicked()) setPath([]);
					for (let i = 0; i < path.size(); i++) {
						const depth = i;
						const segment = path[i];
						if (button(`/ ${segment}`).clicked()) setPath(path.filter((_, idx) => idx <= depth));
					}
				});

				__scope("table-explorer:search", () => {
					useKey("search");
					const filter = input({ text: search, placeholder: "filter by key" });
					if (filter.changed() || filter.submitted()) setSearch(filter.value());
				});
				separator();

				const current = rowsAtPath(rows, path);
				const query = search.lower();
				let shown = 0;
				uiTable(
				{
					scrollX: true,
					columns: [{ width: 140 }, { width: 90 }, { fill: true, minWidth: 160 }, { width: 80 }],
				},
				() => {
					tableRow(() => {
						tableCell(() => label("Key"));
						tableCell(() => label("Type"));
						tableCell(() => label("Preview"));
						tableCell(() => label(""));
					});
					for (const node of current) {
						if (query.size() > 0 && node.key.lower().find(query, 1, true)[0] === undefined) continue;
						shown += 1;
						__scope("table-explorer:row", () => {
							useKey([...path, node.key].join("."));
							tableRow(() => {
								tableCell(() => label(node.cycle === true ? `${node.key} (cycle)` : node.key));
								tableCell(() => label(node.typeLabel));
								tableCell(() => label(node.truncated === true ? `${node.preview} …` : node.preview));
								tableCell(() => {
									if (isExpandable(node) && button("Open").clicked()) setPath([...path, node.key]);
								});
							});
						});
					}
				});
				if (shown === 0) label("No matching keys.");
			},
		);

		return {
			closed() {
				return handle.closed();
			},
		};
	},
	"@rovy/ui/tableExplorer",
);
