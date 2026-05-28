import { __scope, button, input, label, row, tableCell, tableRow, uiTable, useKey, window } from "@rovy/ui";
import { WorldInspectorRecorderState } from "../runtime/recorder";

/** Paginated frame-table window. */
export function recorderResult(state: WorldInspectorRecorderState): void {
	const handle = window(
		{
			title: "Frame Recording Results",
			closable: true,
			minimizable: true,
			resizable: true,
			scrollY: true,
			size: new Vector2(560, 480),
			onClose: () => {
				state.resultWindowOpen = false;
			},
		},
		() => {
			renderResultBody(state);
		},
	);
	if (handle.closed()) state.resultWindowOpen = false;
}

function renderResultBody(state: WorldInspectorRecorderState): void {
	const totalPages = math.max(1, math.ceil(state.count / state.pageSize));
	if (state.page >= totalPages) state.page = totalPages - 1;
	if (state.page < 0) state.page = 0;

	row(() => {
		__scope("recorder-result:search", () => {
			useKey("search");
			const search = input({ text: state.searchQuery, placeholder: "jump to frame index" });
			if (search.changed() || search.submitted()) {
				state.searchQuery = search.value();
				const parsed = tonumber(search.value());
				if (parsed !== undefined && state.count > 0) {
					const idx = math.clamp(math.floor(parsed), 0, state.count - 1);
					state.page = math.floor(idx / state.pageSize);
				}
			}
		});
		if (button("Prev").clicked()) state.page = math.max(0, state.page - 1);
		if (button("Next").clicked()) state.page = math.min(totalPages - 1, state.page + 1);
		label(`page ${tostring(state.page + 1)} / ${tostring(totalPages)}`);
	});
	label(`${tostring(state.count)} frames captured (max ${tostring(state.config.maxFrames)})`);

	if (state.count === 0) {
		label("No frames recorded.");
		return;
	}

	const start = state.page * state.pageSize;
	const endExclusive = math.min(state.count, start + state.pageSize);

	uiTable({ columns: [{ width: 70 }, { width: 90 }, { width: 90 }, { fill: true }] }, () => {
		tableRow(() => {
			tableCell(() => label("Frame"));
			tableCell(() => label("Comp Δ"));
			tableCell(() => label("Res Δ"));
			tableCell(() => label(""));
		});
		for (let i = start; i < endExclusive; i++) {
			const record = state.getFrameAt(i);
			if (record === undefined) continue;
			const uiIdx = i;
			__scope("recorder-result:row", () => {
				useKey(tostring(uiIdx));
				tableRow(() => {
					tableCell(() => label(tostring(record.relativeIndex)));
					tableCell(() => label(tostring(record.componentChanges)));
					tableCell(() => label(tostring(record.resourceChanges)));
					tableCell(() => {
						const open = state.openDetailFrames.has(uiIdx);
						if (button(open ? "Hide" : "Details").clicked()) {
							if (open) state.openDetailFrames.delete(uiIdx);
							else state.openDetailFrames.add(uiIdx);
						}
					});
				});
			});
		}
	});
}
