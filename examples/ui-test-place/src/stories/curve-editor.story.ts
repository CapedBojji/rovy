import RovyUi, {
	button,
	checkbox,
	createRovyInputServiceFromSignals,
	label,
	separator,
	space,
	window as uiWindow,
} from "@rovy/ui";
import { Boolean as BooleanControl, type InferGenericProps } from "@rbxts/ui-labs";

const controls = {
	Visible: BooleanControl(true),
};

type CurveEditorControls = InferGenericProps<typeof controls>["controls"];

interface RovyInputSignal {
	Connect(handler: (input: InputObject, gameProcessedEvent: boolean) => void): RBXScriptConnection;
}

interface RovyInputSignals {
	InputBegan: RovyInputSignal;
	InputChanged: RovyInputSignal;
	InputEnded: RovyInputSignal;
	MouseMoved?: {
		Connect(handler: (mousePosition: Vector2) => void): RBXScriptConnection;
	};
	GetMouseLocation(): Vector2;
}

interface CurveEditorStoryProps {
	controls: CurveEditorControls;
	target: Frame;
	inputListener: RovyInputSignals;
	subscribe: (listener: (values: CurveEditorControls, info: unknown) => void) => () => void;
}

type StoryCurvePathCommand =
	| { kind: "M"; point: { x: number; y: number } }
	| { kind: "L"; point: { x: number; y: number } }
	| { kind: "Q"; control: { x: number; y: number }; point: { x: number; y: number } }
	| {
			kind: "C";
			control1: { x: number; y: number };
			control2: { x: number; y: number };
			point: { x: number; y: number };
	  };

interface CurveEditorExports {
	curveEditor?: (options: {
		width?: number;
		height?: number;
		sampleCount: number;
		showReadout?: boolean;
		allowScroll?: boolean;
		returnToOriginKey?: number;
	}, children?: () => void) => {
		viewportOffset(): Vector2;
		returnToOrigin(): void;
		deleteSelectedPoint(): boolean;
		getSegments(): Array<{
			id: string;
			points: Array<unknown>;
			commands: Array<unknown>;
		}>;
		selectedSegment(): string | undefined;
	};
	curvePath?: (options: {
		id: string;
		revision?: number;
		commands: StoryCurvePathCommand[];
		color?: Color3;
		thickness?: number;
		locked?: boolean;
	}) => {
		getCommands(): StoryCurvePathCommand[];
	};
}

interface RuntimeLib {
	import(context: Instance, module: Instance, ...paths: string[]): unknown;
}

function findChild(parent: Instance | undefined, name: string): Instance | undefined {
	return parent?.FindFirstChild(name);
}

function loadCurveEditorExports(): CurveEditorExports | undefined {
	const aggregate = RovyUi as unknown as CurveEditorExports;
	if (aggregate.curveEditor !== undefined) return aggregate;

	const replicatedStorage = game.GetService("ReplicatedStorage");
	const include = findChild(replicatedStorage, "rbxts_include");
	const nodeModules = findChild(include, "node_modules");
	const rovyScope = findChild(nodeModules, "@rovy");
	const uiPackage = findChild(rovyScope, "ui");
	const out = findChild(uiPackage, "out");
	const widgets = findChild(out, "widgets");
	const curveEditorModule = findChild(widgets, "curve-editor");
	if (curveEditorModule === undefined || !curveEditorModule.IsA("ModuleScript") || widgets === undefined) return undefined;

	const runtimeModule = findChild(include, "RuntimeLib");
	if (runtimeModule === undefined || !runtimeModule.IsA("ModuleScript")) return undefined;
	const runtime = require(runtimeModule) as RuntimeLib;
	const [ok, loadedExports] = pcall(() => runtime.import(script, widgets, "curve-editor") as CurveEditorExports);
	return ok ? loadedExports : undefined;
}

const story = {
	name: "Infinite Canvas",
	summary: "Renders the @rovy/ui infinite graph canvas in a Rovy window.",
	controls,
	use: "Generic",
	render: (props: CurveEditorStoryProps) => {
		const container = new Instance("Frame");
		container.Name = "RovyUiCurveEditorStory";
		container.BackgroundTransparency = 1;
		container.Size = UDim2.fromScale(1, 1);
		container.Parent = props.target;

		const root = RovyUi.new(container, {
			inputService: createRovyInputServiceFromSignals(props.inputListener),
		});

		let currentControls = props.controls;
		let curveEditorExports = loadCurveEditorExports();
		let returnToOriginKey: number | undefined;
		let takeFullWidth = true;
		let showCanvasReadout = true;
		let allowCanvasPan = true;
		const lineCommands: StoryCurvePathCommand[] = [
			{ kind: "M", point: { x: -180, y: -60 } },
			{ kind: "L", point: { x: -20, y: 50 } },
			{ kind: "L", point: { x: 120, y: -30 } },
		];
		const bezierCommands: StoryCurvePathCommand[] = [
			{ kind: "M", point: { x: -120, y: 95 } },
			{
				kind: "C",
				control1: { x: -60, y: -120 },
				control2: { x: 120, y: 150 },
				point: { x: 210, y: 15 },
			},
		];
		const render = (): void => {
			RovyUi.start(root, () => {
				if (!currentControls.Visible) return;
				uiWindow(
					{
						title: "Infinite Canvas",
						position: new Vector2(40, 40),
						size: new Vector2(520, 420),
						resizable: true,
						scrollY: true,
						minimizable: true,
					},
					() => {
						label("Panel A");
						label("Timeline 01");
						label("Timeline 02");
						button("Window Action");
						separator();

						const fullWidthToggle = checkbox("Take full width", { checked: takeFullWidth });
						if (fullWidthToggle.clicked()) takeFullWidth = !takeFullWidth;
						const readoutToggle = checkbox("Show canvas readout", { checked: showCanvasReadout });
						if (readoutToggle.clicked()) showCanvasReadout = !showCanvasReadout;
						const panToggle = checkbox("Canvas panning", { checked: allowCanvasPan });
						if (panToggle.clicked()) allowCanvasPan = !allowCanvasPan;
						const returnToOrigin = button("Return to Origin").clicked();
						if (returnToOrigin) returnToOriginKey = (returnToOriginKey ?? 0) + 1;
						const deleteSelected = button("Delete Selected Point").clicked();

						if (curveEditorExports === undefined) curveEditorExports = loadCurveEditorExports();
						if (
							curveEditorExports === undefined ||
							curveEditorExports.curveEditor === undefined ||
							curveEditorExports.curvePath === undefined
						) {
							label("Curve editor module is still syncing. Restart Rojo serve if this message stays visible.", {
								wrapped: true,
							});
							return;
						}

						const editor = curveEditorExports.curveEditor(
							{
								width: takeFullWidth ? undefined : 320,
								height: 220,
								sampleCount: 48,
								showReadout: showCanvasReadout,
								allowScroll: allowCanvasPan,
								returnToOriginKey,
							},
							() => {
								curveEditorExports!.curvePath!({
									id: "line",
									revision: 1,
									commands: lineCommands,
									color: Color3.fromRGB(94, 234, 212),
									thickness: 2,
								});
								curveEditorExports!.curvePath!({
									id: "bezier",
									revision: 1,
									commands: bezierCommands,
									color: Color3.fromRGB(147, 197, 253),
									thickness: 3,
								});
							},
						);
						if (returnToOrigin) editor.returnToOrigin();
						if (deleteSelected) editor.deleteSelectedPoint();
						const offset = editor.viewportOffset();
						const segments = editor.getSegments();
						let pointCount = 0;
						let commandCount = 0;
						for (const segment of segments) {
							pointCount += segment.points.size();
							commandCount += segment.commands.size();
						}
						label(
							`Origin ${math.floor(offset.X)}, ${math.floor(offset.Y)}  ${takeFullWidth ? "full" : "fixed"} width  Segments ${segments.size()}  Points ${pointCount}  Commands ${commandCount}  Selected ${editor.selectedSegment() ?? "none"}`,
							{ wrapped: true },
						);

						separator();
						label("Timeline 03");
						label("Timeline 04");
						label("Timeline 05");
						space(12);
						button("Lower Action");
						label("Panel B");
					},
				);
			});
		};

		render();

		const runService = game.GetService("RunService");
		const connection = runService.RenderStepped.Connect(render);
		const unsubscribe = props.subscribe((values) => {
			currentControls = values;
			render();
		});

		return () => {
			unsubscribe();
			connection.Disconnect();
			RovyUi.start(root, () => {});
			container.Destroy();
		};
	},
};

export = story;
