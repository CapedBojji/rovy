# Curve Editor

`curveEditor` is an infinite editable-image canvas for world-space curve paths. It is useful for animation curves, path authoring, timeline tooling, and UI Labs inspection.

The current curve editor keeps path data caller-owned: `curvePath({ commands })` receives a command array, and edits mutate that same array immediately.

## Basic Canvas

```ts
const editor = curveEditor({
	width: 420,
	height: 240,
	allowScroll: true,
});

if (button("Return to Origin").clicked()) {
	editor.returnToOrigin();
}
```

```ts
interface CurveEditorOptions {
	initialCurve?: BezierCurve;
	presets?: CurvePreset[];
	width?: number;
	height?: number;
	sampleCount?: number;
	showReadout?: boolean;
	allowScroll?: boolean;
	returnToOriginKey?: unknown;
}
```

If `width` is omitted, the canvas grows with its widget. If `height` is omitted, it grows vertically too. Use fixed dimensions when embedding it in a known tool area.

`allowScroll: false` disables canvas panning. Mouse wheel scrolling is ignored by the canvas so parent windows can own wheel scroll.

## Scoped Paths

Declare editable paths inside the `curveEditor` child scope.

```ts
const commands: CurvePathCommand[] = [
	{ kind: "M", point: { x: 0, y: 0 } },
	{
		kind: "C",
		control1: { x: 80, y: -40 },
		control2: { x: 160, y: 40 },
		point: { x: 240, y: 0 },
	},
];

const editor = curveEditor({ height: 220 }, () => {
	const path = curvePath({
		id: "main",
		commands,
		color: Color3.fromRGB(147, 197, 253),
		thickness: 3,
	});

	if (button("Make Incoming Line").clicked()) {
		path.convertCommand(1, "L");
	}
});
```

`commands` is the source of truth. Dragging points, dragging handles, inserting points, deleting points, and converting line/quad/cubic commands all mutate the passed command array in the same input event or render frame that handles the UI action.

## Path Commands

```ts
type CurveCanvasPoint = { x: number; y: number };

type CurvePathCommand =
	| { kind: "M"; point: CurveCanvasPoint }
	| { kind: "L"; point: CurveCanvasPoint }
	| { kind: "Q"; control: CurveCanvasPoint; point: CurveCanvasPoint }
	| { kind: "C"; control1: CurveCanvasPoint; control2: CurveCanvasPoint; point: CurveCanvasPoint }
	| { kind: "Z" };

type CurveSegmentKind = "L" | "Q" | "C";
```

Rules:

- The first command must be `M`.
- A path must have at least two editable points.
- `L` is a straight segment.
- `Q` is a quadratic Bezier segment.
- `C` is a cubic Bezier segment.
- `Z` closes the current subpath; closed segments are rendered and hit-tested, but right-click conversion does not edit `Z`.

## Interaction Model

- Drag empty canvas to pan, when `allowScroll` is enabled.
- Click a point to select it.
- Click a selected point's handles to drag Bezier handles.
- Click directly on an existing line, quadratic, or cubic segment to insert a point.
- Press Backspace or Delete to delete the selected point when deletion is valid.
- Right-click a point or handle to open compact context controls.

The context controls spawn like a normal context menu: to the right of the click when possible, flipped to the left when the menu would overflow, and vertically clamped into the containing UI. `Delete Point` is disabled when deleting would leave the path with fewer than two editable points.

Right-click controls can convert incoming and outgoing adjacent segments:

- `L -> Q`: adds a midpoint control.
- `L -> C`: adds one-third and two-thirds controls.
- `Q -> L`: drops the control.
- `Q -> C`: exact quadratic-to-cubic conversion.
- `C -> L`: drops both controls.
- `C -> Q`: approximates a quadratic control from both cubic handles.

## Handles

```ts
interface CurveEditorHandle {
	viewportOffset(): Vector2;
	returnToOrigin(): void;
	getSegments(): CurvePathSnapshot[];
	selectedSegment(): string | undefined;
	selectedPoint(): { segmentId: string; pointIndex: number } | undefined;
	deleteSelectedPoint(): boolean;

	// Legacy normalized curve/preset API remains available:
	curve(): BezierCurve;
	changed(): boolean;
	selectedAnchor(): number | undefined;
	presets(): CurvePreset[];
	selectedPreset(): string | undefined;
}

interface CurvePathHandle {
	getCommands(): CurvePathCommand[];
	getPoints(): CurvePathPointInfo[];
	getSnapshot(): CurvePathSnapshot | undefined;
	selected(): boolean;
	convertCommand(commandIndex: number, kind: CurveSegmentKind): boolean;
}
```

`commandIndex` is zero-based in TypeScript. For a path like `[M, C]`, the cubic command index is `1`.

## Snapshots

Use `getSegments()` to read cloned snapshots for display, serialization, or debugging.

```ts
const segments = editor.getSegments();
for (const segment of segments) {
	print(segment.id, segment.commands.size(), segment.points.size());
}
```

```ts
interface CurvePathPointInfo {
	index: number;
	commandIndex: number;
	commandKind: "M" | "L" | "Q" | "C";
	point: CurveCanvasPoint;
	inHandle?: CurveCanvasPoint;
	outHandle?: CurveCanvasPoint;
}

interface CurvePathSnapshot {
	id: string;
	revision?: string | number;
	commands: CurvePathCommand[];
	points: CurvePathPointInfo[];
	color?: Color3;
	thickness?: number;
	visible: boolean;
	locked: boolean;
	metadata?: unknown;
}
```

Snapshots are cloned. Mutate the original `commands` array or use widget interactions to edit the live path.

## Path Options

```ts
interface CurvePathOptions {
	id: string;
	revision?: string | number;
	commands: CurvePathCommand[];
	color?: Color3;
	thickness?: number;
	visible?: boolean;
	locked?: boolean;
	metadata?: unknown;
}
```

- New `id`: registers the path.
- Same `id`: keeps using the same command table.
- Missing path on a later frame: removes that path from editor state.
- `locked: true`: renders the path but blocks selection, dragging, insertion, deletion, and context controls.

## Legacy Normalized Curves

The original normalized curve API remains available:

```ts
type BezierCurvePoint = { x: number; y: number };
type BezierCurveAnchor = {
	x: number;
	y: number;
	inHandle?: BezierCurvePoint;
	outHandle?: BezierCurvePoint;
};
type BezierCurve = { anchors: BezierCurveAnchor[] };
```

Use `sampleBezierCurve(curve, sampleCount)` to sample the normalized left-to-right graph form into `Vector2[]`.
