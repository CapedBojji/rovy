import { label, tableCell, tableRow, uiTable, window } from "@rovy/ui";
import { formatTarget } from "../runtime/recorder-snapshot";
import { WorldInspectorRecorderState } from "../runtime/recorder";

/** Per-frame detail window. Caller scopes & keys this widget per frameIndex. */
export function recorderDetail(state: WorldInspectorRecorderState, frameIndex: number): void {
	const record = state.getFrameAt(frameIndex);
	if (record === undefined) {
		state.openDetailFrames.delete(frameIndex);
		return;
	}
	const handle = window(
		{
			title: `Frame ${tostring(record.relativeIndex)} (tick ${tostring(record.tick)})`,
			closable: true,
			minimizable: true,
			resizable: true,
			scrollY: true,
			size: new Vector2(540, 420),
			onClose: () => {
				state.openDetailFrames.delete(frameIndex);
			},
		},
		() => {
			label(
				`${tostring(record.entries.size())} entries  •  comp ${tostring(record.componentChanges)}  •  res ${tostring(record.resourceChanges)}`,
			);
			uiTable({ columns: [{ width: 70 }, { width: 200 }, { fill: true }, { fill: true }] }, () => {
				tableRow(() => {
					tableCell(() => label("Kind"));
					tableCell(() => label("Target"));
					tableCell(() => label("Old"));
					tableCell(() => label("New"));
				});
				for (const entry of record.entries) {
					tableRow(() => {
						tableCell(() => label(entry.kind));
						tableCell(() => label(formatTarget(entry.target)));
						tableCell(() => label(entry.oldText ?? "-"));
						tableCell(() => label(entry.newText ?? "-"));
					});
				}
			});
		},
	);
	if (handle.closed()) state.openDetailFrames.delete(frameIndex);
}
