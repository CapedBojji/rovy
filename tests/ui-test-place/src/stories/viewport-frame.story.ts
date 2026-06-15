import RovyUi, {
	button,
	checkbox,
	createRovyInputServiceFromSignals,
	label,
	separator,
	useKey,
	viewportFrame,
	viewportItem,
	window as uiWindow,
} from "@rovy/ui";
import { Boolean as BooleanControl, type InferGenericProps } from "@rbxts/ui-labs";

const controls = {
	Visible: BooleanControl(true),
};

type ViewportFrameControls = InferGenericProps<typeof controls>["controls"];

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

interface ViewportFrameStoryProps {
	controls: ViewportFrameControls;
	target: Frame;
	inputListener: RovyInputSignals;
	subscribe: (listener: (values: ViewportFrameControls, info: unknown) => void) => () => void;
}

interface PreviewItem {
	id: string;
	source: Instance;
	pivot: CFrame;
	scale?: number;
	visible: boolean;
}

function makePart(name: string, size: Vector3, color: Color3): Part {
	const part = new Instance("Part");
	part.Name = name;
	part.Anchored = true;
	part.Material = Enum.Material.SmoothPlastic;
	part.Size = size;
	part.Color = color;
	return part;
}

function makeSourceModel(): Model {
	const model = new Instance("Model");
	model.Name = "StackedModel";

	const base = makePart("Base", new Vector3(2.6, 0.35, 2.6), Color3.fromRGB(32, 44, 61));
	base.CFrame = new CFrame(0, 0, 0);
	base.Parent = model;

	const core = makePart("Core", new Vector3(1.25, 1.4, 1.25), Color3.fromRGB(94, 234, 212));
	core.CFrame = new CFrame(0, 0.85, 0);
	core.Parent = model;

	const cap = makePart("Cap", new Vector3(1.8, 0.25, 1.8), Color3.fromRGB(147, 197, 253));
	cap.CFrame = new CFrame(0, 1.7, 0);
	cap.Parent = model;

	return model;
}

const story = {
	name: "Viewport Frame",
	summary: "Renders cloned @rovy/ui viewport items with a controlled camera.",
	controls,
	use: "Generic",
	render: (props: ViewportFrameStoryProps) => {
		const container = new Instance("Frame");
		container.Name = "RovyUiViewportFrameStory";
		container.BackgroundTransparency = 1;
		container.Size = UDim2.fromScale(1, 1);
		container.Parent = props.target;

		const root = RovyUi.new(container, {
			inputService: createRovyInputServiceFromSignals(props.inputListener),
		});

		let currentControls = props.controls;
		let showModel = true;
		let showAccent = true;
		let largePreview = false;
		let cameraNear = false;
		let revision = 0;

		const model = makeSourceModel();
		const accent = makePart("AccentPart", new Vector3(0.7, 2.2, 0.7), Color3.fromRGB(251, 191, 36));

		const render = (): void => {
			const previewItems: PreviewItem[] = [
				{
					id: "model",
					source: model,
					pivot: new CFrame(-1.1, 0, 0),
					scale: largePreview ? 1.18 : 1,
					visible: showModel,
				},
				{
					id: "accent",
					source: accent,
					pivot: CFrame.Angles(0, math.rad(28 + revision * 8), 0).add(new Vector3(1.7, 0.7, 0)),
					visible: showAccent,
				},
			];
			const cameraPosition = cameraNear ? new Vector3(0, 2.4, 6.5) : new Vector3(0, 3.2, 9);
			const camera = CFrame.lookAt(cameraPosition, new Vector3(0, 0.75, 0));

			RovyUi.start(root, () => {
				if (!currentControls.Visible) return;
				uiWindow(
					{
						title: "Viewport Frame",
						position: new Vector2(72, 52),
						size: new Vector2(420, 360),
						resizable: true,
						scrollY: true,
						minimizable: true,
					},
					() => {
						const modelToggle = checkbox("Model", { checked: showModel });
						if (modelToggle.clicked()) showModel = !showModel;
						const accentToggle = checkbox("Accent", { checked: showAccent });
						if (accentToggle.clicked()) showAccent = !showAccent;
						const sizeToggle = checkbox("Large preview", { checked: largePreview });
						if (sizeToggle.clicked()) largePreview = !largePreview;
						const cameraToggle = checkbox("Near camera", { checked: cameraNear });
						if (cameraToggle.clicked()) cameraNear = !cameraNear;
						if (button("Rotate Accent").clicked()) revision += 1;

						separator();

						const frame = viewportFrame(
							{
								width: 320,
								height: 190,
								backgroundColor: Color3.fromRGB(9, 12, 18),
								border: true,
								camera: {
									cframe: camera,
									fieldOfView: cameraNear ? 32 : 38,
								},
							},
							() => {
								for (const item of previewItems) {
									useKey(item.id);
									viewportItem({
										source: item.source,
										pivot: item.pivot,
										scale: item.scale,
										visible: item.visible,
									});
								}
							},
						);

						label(
							`Items ${frame.itemCount()}  FOV ${cameraNear ? 32 : 38}  Accent rotation ${revision * 8} deg`,
							{ wrapped: true },
						);
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
