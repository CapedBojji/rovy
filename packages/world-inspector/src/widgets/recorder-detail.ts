import { __scope, button, label, tableCell, tableRow, uiTable, useKey, window } from "@rovy/ui";
import { formatTarget } from "../runtime/recorder-snapshot";
import { WorldInspectorRecorderState } from "../runtime/recorder";
import { isExpandable, type WorldInspectorValueNodeDto } from "../runtime/value-tree";
import { WorldInspectorState } from "../state";

function targetPath(entry: { target: { kind: string; path?: string } }): string {
	return entry.target.kind === "resource" ? (entry.target.path ?? "") : "";
}

function valueCell(
	state: WorldInspectorState,
	frameIndex: number,
	entryIndex: number,
	side: "old" | "new",
	tree: WorldInspectorValueNodeDto | undefined,
	title: string,
): void {
	if (tree === undefined) {
		label("-");
		return;
	}
	if (!isExpandable(tree)) {
		label(tree.preview);
		return;
	}
	const explorerKey = `frame:${tostring(frameIndex)}:${tostring(entryIndex)}:${side}`;
	if (button(side === "old" ? "View Old" : "View New").clicked()) {
		state.openTableExplorer(explorerKey, title, { kind: "frame", frameIndex, entryIndex, side });
	}
}

/** Per-frame detail window. Caller scopes & keys this widget per frameIndex. */
export function recorderDetail(state: WorldInspectorState, recorder: WorldInspectorRecorderState, frameIndex: number): void {
	const record = recorder.getFrameAt(frameIndex);
	if (record === undefined) {
		recorder.openDetailFrames.delete(frameIndex);
		return;
	}
	const handle = window(
		{
			title: `Frame ${tostring(record.relativeIndex)} (tick ${tostring(record.tick)})`,
			closable: true,
			minimizable: true,
			resizable: true,
			scrollY: true,
			size: new Vector2(640, 420),
			onClose: () => {
				recorder.openDetailFrames.delete(frameIndex);
			},
		},
		() => {
			label(
				`${tostring(record.entries.size())} entries  •  ent ${tostring(record.entityChanges)}  •  comp ${tostring(record.componentChanges)}  •  res ${tostring(record.resourceChanges)}  •  rel ${tostring(record.relationChanges)}`,
			);
			uiTable({ columns: [{ width: 60 }, { width: 200 }, { width: 110 }, { width: 90 }, { width: 90 }] }, () => {
				tableRow(() => {
					tableCell(() => label("Kind"));
					tableCell(() => label("Target"));
					tableCell(() => label("Path"));
					tableCell(() => label("Old"));
					tableCell(() => label("New"));
				});
				for (let i = 0; i < record.entries.size(); i++) {
					const entryIndex = i;
					const entry = record.entries[i];
					const targetText = formatTarget(entry.target);
					__scope("recorder-detail:row", () => {
						useKey(tostring(entryIndex));
						tableRow(() => {
							tableCell(() => label(entry.kind));
							tableCell(() => label(targetText));
							tableCell(() => label(targetPath(entry)));
							tableCell(() => valueCell(state, frameIndex, entryIndex, "old", entry.oldTree, `Old: ${targetText}`));
							tableCell(() => valueCell(state, frameIndex, entryIndex, "new", entry.newTree, `New: ${targetText}`));
						});
					});
				}
			});
		},
	);
	if (handle.closed()) recorder.openDetailFrames.delete(frameIndex);
}
