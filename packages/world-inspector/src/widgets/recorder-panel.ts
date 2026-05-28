import { __scope, button, collapsingHeader, input, label, row, useKey } from "@rovy/ui";
import { WorldInspectorRecorderState } from "../runtime/recorder";

/** Collapsing section. Renders inside the main inspector window. */
export function recorderPanel(state: WorldInspectorRecorderState): void {
	collapsingHeader("Frame Recorder", () => {
		row(() => {
			const recording = state.phase === "recording";
			const btnLabel = recording ? "Stop" : "Record";
			if (button(btnLabel).clicked()) {
				if (recording) state.queueStop();
				else state.queueStart();
			}
			__scope("recorder-panel:max-frames", () => {
				useKey("max-frames");
				const cap = input({ text: state.maxFramesDraft, placeholder: "max frames" });
				if (cap.changed() || cap.submitted()) {
					state.maxFramesDraft = cap.value();
					if (cap.submitted()) state.applyMaxFramesDraft();
				}
			});
		});
		label(`phase: ${state.phase}   frames: ${tostring(state.count)} / ${tostring(state.config.maxFrames)}`);
		if (state.phase === "stopped" && state.count > 0) {
			if (button("Open Results").clicked()) state.resultWindowOpen = true;
		}
	});
}
