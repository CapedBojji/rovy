import { tableExplorer as uiTableExplorer } from "@rovy/ui";
import type { WorldInspectorValueNodeDto } from "../runtime/value-tree";
import { WorldInspectorState } from "../state";

/**
 * Adapter over the built-in `@rovy/ui` table explorer. Existence/title/source live in
 * `state.tableExplorers`; the navigable widget owns its own breadcrumb + filter state.
 */
export function tableExplorer(state: WorldInspectorState, key: string, rootRows: ReadonlyArray<WorldInspectorValueNodeDto>): void {
	const explorer = state.tableExplorers.get(key);
	if (explorer === undefined) return;
	uiTableExplorer(rootRows, { title: explorer.title, onClose: () => state.closeTableExplorer(key) });
}
