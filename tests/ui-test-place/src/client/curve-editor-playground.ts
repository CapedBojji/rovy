import {
	__useState,
	curveEditor,
	curvePath,
	heading,
	label,
	sampleBezierCurve,
	space,
	type CurvePathCommand,
	window as uiWindow,
} from "@rovy/ui";

function v2(x: number, y: number): Vector2 {
	return new Vector2(x, y);
}

/** @widget */
export function curveEditorPlayground(): void {
	const [lineCommands] = __useState<CurvePathCommand[]>("curveEditorPlayground:lineCommands", () => [
		{ kind: "M", point: { x: -120, y: -40 } },
		{ kind: "L", point: { x: -20, y: 35 } },
		{ kind: "L", point: { x: 110, y: -20 } },
	]);
	const [curveCommands] = __useState<CurvePathCommand[]>("curveEditorPlayground:curveCommands", () => [
		{ kind: "M", point: { x: -100, y: 70 } },
		{
			kind: "C",
			control1: { x: -60, y: -90 },
			control2: { x: 100, y: 120 },
			point: { x: 150, y: 20 },
		},
	]);

	uiWindow(
		{
			title: "Curve Editor Lab",
			position: v2(420, 60),
			size: v2(380, 520),
			movable: true,
			resizable: true,
			minimizable: true,
			scrollY: true,
		},
		() => {
			heading("Infinite graph canvas");
			const editor = curveEditor({ width: 320, height: 180, sampleCount: 48 }, () => {
				curvePath({
					id: "playground-line",
					revision: 1,
					commands: lineCommands,
					color: Color3.fromRGB(94, 234, 212),
				});
				curvePath({
					id: "playground-curve",
					revision: 1,
					commands: curveCommands,
					color: Color3.fromRGB(147, 197, 253),
					thickness: 3,
				});
			});
			const curve = editor.curve();
			const samples = sampleBezierCurve(curve, 48);
			const offset = editor.viewportOffset();
			const segments = editor.getSegments();
			space(4);
			label(
				`Origin: ${math.floor(offset.X)}, ${math.floor(offset.Y)}  Samples: ${samples.size()}  Segments: ${segments.size()}  Preset: ${
					editor.selectedPreset() ?? "none"
				}`,
				{ wrapped: true },
			);
			label(`Changed: ${editor.changed() ? "yes" : "no"}  Anchors: ${curve.anchors.size()}`, {
				wrapped: true,
			});
		},
	);
}
