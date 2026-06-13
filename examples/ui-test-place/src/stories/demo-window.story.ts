import RovyUi, { demoWindow } from "@rovy/ui";
import { Boolean as BooleanControl, type InferGenericProps } from "@rbxts/ui-labs";

const controls = {
	Visible: BooleanControl(true),
};

type DemoWindowControls = InferGenericProps<typeof controls>["controls"];

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

interface DemoStoryProps {
	controls: DemoWindowControls;
	target: Frame;
	inputListener: RovyInputSignals;
	subscribe: (listener: (values: DemoWindowControls, info: unknown) => void) => () => void;
}

function createStoryInputService(inputSignals: RovyInputSignals) {
	return {
		InputBegan: inputSignals.InputBegan,
		InputChanged: {
			Connect(handler: (input: InputObject, gameProcessedEvent: boolean) => void): RBXScriptConnection {
				const inputChangedConnection = inputSignals.InputChanged.Connect(handler);
				const mouseMovedConnection = inputSignals.MouseMoved?.Connect((mousePosition) => {
					handler(
						{
							UserInputType: Enum.UserInputType.MouseMovement,
							KeyCode: Enum.KeyCode.Unknown,
							Position: new Vector3(mousePosition.X, mousePosition.Y, 0),
						} as InputObject,
						false,
					);
				});

				return {
					Connected: true,
					Disconnect() {
						inputChangedConnection.Disconnect();
						mouseMovedConnection?.Disconnect();
						(this as RBXScriptConnection).Connected = false;
					},
				} as RBXScriptConnection;
			},
		},
		InputEnded: inputSignals.InputEnded,
		GetMouseLocation: () => inputSignals.GetMouseLocation(),
	};
}

const story = {
	name: "Demo Window",
	summary: "Renders the @rovy/ui demo window through a UI Labs generic story.",
	controls,
	use: "Generic",
	render: (props: DemoStoryProps) => {
		const container = new Instance("Frame");
		container.Name = "RovyUiDemoWindowStory";
		container.BackgroundTransparency = 1;
		container.Size = UDim2.fromScale(1, 1);
		container.Parent = props.target;

		const root = RovyUi.new(container, {
			inputService: createStoryInputService(props.inputListener),
		});

		let currentControls = props.controls;
		const render = (): void => {
			RovyUi.start(root, () => {
				if (currentControls.Visible) demoWindow();
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
