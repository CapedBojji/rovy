import {
	EditableImageBuffer,
	__useState,
	button,
	editableImage,
	heading,
	label,
	row,
	separator,
	slider,
	space,
	window as uiWindow,
} from "@rovy/ui";

const PREVIEW_SIZE = v2(192, 128);

interface CurvePoint {
	x: number;
	y: number;
}

function c(r: number, g: number, b: number): Color3 {
	return Color3.fromRGB(r, g, b);
}

function v2(x: number, y: number): Vector2 {
	return new Vector2(x, y);
}

function udim2(xs: number, xo: number, ys: number, yo: number): UDim2 {
	return new UDim2(xs, xo, ys, yo);
}

function pointOnCubic(t: number, p0: CurvePoint, p1: CurvePoint, p2: CurvePoint, p3: CurvePoint): CurvePoint {
	const inv = 1 - t;
	const a = inv * inv * inv;
	const b = 3 * inv * inv * t;
	const cc = 3 * inv * t * t;
	const d = t * t * t;

	return {
		x: a * p0.x + b * p1.x + cc * p2.x + d * p3.x,
		y: a * p0.y + b * p1.y + cc * p2.y + d * p3.y,
	};
}

function toCanvas(point: CurvePoint): Vector2 {
	const pad = 16;
	const width = PREVIEW_SIZE.X - pad * 2;
	const height = PREVIEW_SIZE.Y - pad * 2;
	return v2(pad + point.x * width, pad + (1 - point.y) * height);
}

function drawGrid(buffer: EditableImageBuffer): void {
	buffer.clear(10, 14, 20, 255);

	for (let x = 16; x <= PREVIEW_SIZE.X - 16; x += 16) {
		buffer.drawLine(v2(x, 12), v2(x, PREVIEW_SIZE.Y - 12), c(31, 42, 58), { alpha: 180 });
	}
	for (let y = 16; y <= PREVIEW_SIZE.Y - 16; y += 16) {
		buffer.drawLine(v2(12, y), v2(PREVIEW_SIZE.X - 12, y), c(31, 42, 58), { alpha: 180 });
	}

	buffer.drawLine(v2(16, PREVIEW_SIZE.Y - 16), v2(PREVIEW_SIZE.X - 16, PREVIEW_SIZE.Y - 16), c(85, 101, 124), {
		alpha: 220,
	});
	buffer.drawLine(v2(16, 16), v2(16, PREVIEW_SIZE.Y - 16), c(85, 101, 124), { alpha: 220 });
}

function drawCurvePreview(buffer: EditableImageBuffer, p1: CurvePoint, p2: CurvePoint, sampleCount: number): void {
	const p0 = { x: 0, y: 0 };
	const p3 = { x: 1, y: 1 };
	const c0 = toCanvas(p0);
	const c1 = toCanvas(p1);
	const c2 = toCanvas(p2);
	const c3 = toCanvas(p3);

	drawGrid(buffer);
	buffer.drawLine(c0, c1, c(104, 129, 162), { alpha: 180, thickness: 1 });
	buffer.drawLine(c2, c3, c(104, 129, 162), { alpha: 180, thickness: 1 });

	let previous = c0;
	for (let i = 1; i <= sampleCount; i++) {
		const t = i / sampleCount;
		const current = toCanvas(pointOnCubic(t, p0, p1, p2, p3));
		buffer.drawLine(previous, current, c(74, 222, 128), { alpha: 255, thickness: 2 });
		previous = current;
	}

	buffer.drawCircle(c0, 3, c(255, 255, 255), { alpha: 255, fill: true });
	buffer.drawCircle(c1, 4, c(255, 196, 87), { alpha: 255, fill: true });
	buffer.drawCircle(c2, 4, c(83, 185, 255), { alpha: 255, fill: true });
	buffer.drawCircle(c3, 3, c(255, 255, 255), { alpha: 255, fill: true });
}

function formatPercent(value: number): string {
	return `${math.round(value * 100)}%`;
}

/** @widget */
export function curveEditorPlayground(): void {
	const [buffer] = __useState("curveEditor:buffer", () => new EditableImageBuffer(PREVIEW_SIZE));
	const [showHelp, setShowHelp] = __useState("curveEditor:showHelp", true);

	uiWindow(
		{
			title: "Curve Editor Lab",
			position: v2(420, 60),
			size: v2(360, 520),
			movable: true,
			resizable: true,
			minimizable: true,
			scrollY: true,
		},
		() => {
			heading("Bezier curve playground");
			label("Use this place as a live UI bench while building the real curve editor.", { wrapped: true });
			space(4);

			const p1x = slider({ label: "P1 X", min: 0, max: 1, initial: 0.25, step: 0.01 });
			const p1y = slider({ label: "P1 Y", min: 0, max: 1, initial: 0.15, step: 0.01 });
			const p2x = slider({ label: "P2 X", min: 0, max: 1, initial: 0.75, step: 0.01 });
			const p2y = slider({ label: "P2 Y", min: 0, max: 1, initial: 0.85, step: 0.01 });
			const samples = slider({ label: "Samples", min: 8, max: 96, initial: 36, step: 1, suffix: " pts" });
			const sampleCount = math.max(8, math.floor(samples));

			drawCurvePreview(buffer, { x: p1x, y: p1y }, { x: p2x, y: p2y }, sampleCount);

			separator();
			const preview = editableImage({
				size: PREVIEW_SIZE,
				displaySize: udim2(0, PREVIEW_SIZE.X, 0, PREVIEW_SIZE.Y),
				backgroundTransparency: 0,
			});
			preview.draw(buffer.getBuffer());

			space(4);
			label(
				`P1 (${formatPercent(p1x)}, ${formatPercent(p1y)})  P2 (${formatPercent(p2x)}, ${formatPercent(p2y)})`,
			);

			row(() => {
				if (button(showHelp ? "Hide notes" : "Show notes", { width: 112 }).clicked()) {
					setShowHelp(!showHelp);
				}
				button("Future: add node drag", { width: 170, disabled: true });
			});

			if (showHelp) {
				label(
					"Next editor steps to try here: draggable handles, tangent lock modes, point insertion, snapping, and serialized curve output.",
					{ wrapped: true },
				);
			}
		},
	);
}
