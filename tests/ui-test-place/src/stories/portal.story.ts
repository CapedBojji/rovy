import RovyUi, {
	button,
	checkbox,
	createRovyInputServiceFromSignals,
	heading,
	label,
	portal,
	separator,
	window as uiWindow,
} from "@rovy/ui";
import { Boolean as BooleanControl, type InferGenericProps } from "@rbxts/ui-labs";

const controls = {
	Visible: BooleanControl(true),
	PortalContent: BooleanControl(true),
};

type PortalControls = InferGenericProps<typeof controls>["controls"];

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

interface PortalStoryProps {
	controls: PortalControls;
	target: Frame;
	inputListener: RovyInputSignals;
	subscribe: (listener: (values: PortalControls, info: unknown) => void) => () => void;
}

function makeTextLabel(parent: Instance, name: string, text: string): TextLabel {
	const label = new Instance("TextLabel");
	label.Name = name;
	label.BackgroundTransparency = 1;
	label.Font = Enum.Font.Code;
	label.Text = text;
	label.TextColor3 = Color3.fromRGB(226, 232, 240);
	label.TextSize = 13;
	label.TextXAlignment = Enum.TextXAlignment.Left;
	label.TextYAlignment = Enum.TextYAlignment.Center;
	label.TextWrapped = true;
	label.Parent = parent;
	return label;
}

function createClippedHost(parent: Instance): Frame {
	const host = new Instance("Frame");
	host.Name = "PortalStoryClippedHost";
	host.BackgroundColor3 = Color3.fromRGB(63, 23, 23);
	host.BorderSizePixel = 0;
	host.ClipsDescendants = true;
	host.Position = UDim2.fromOffset(64, 378);
	host.Size = UDim2.fromOffset(286, 86);
	host.Parent = parent;

	const stroke = new Instance("UIStroke");
	stroke.Color = Color3.fromRGB(248, 113, 113);
	stroke.Thickness = 1;
	stroke.Parent = host;

	const padding = new Instance("UIPadding");
	padding.PaddingLeft = new UDim(0, 10);
	padding.PaddingRight = new UDim(0, 10);
	padding.PaddingTop = new UDim(0, 8);
	padding.PaddingBottom = new UDim(0, 8);
	padding.Parent = host;

	const title = makeTextLabel(host, "PortalStoryClippedHostLabel", "Clipped host frame");
	title.Size = UDim2.fromOffset(180, 22);

	const clippedChild = makeTextLabel(host, "PortalStoryClippedLocalChild", "Ordinary child gets clipped at this edge");
	clippedChild.BackgroundColor3 = Color3.fromRGB(127, 29, 29);
	clippedChild.BackgroundTransparency = 0.08;
	clippedChild.Position = UDim2.fromOffset(144, 42);
	clippedChild.Size = UDim2.fromOffset(240, 28);

	return host;
}

function createPortalTarget(parent: Instance): Frame {
	const target = new Instance("Frame");
	target.Name = "PortalStoryTarget";
	target.BackgroundColor3 = Color3.fromRGB(20, 83, 45);
	target.BackgroundTransparency = 0.04;
	target.BorderSizePixel = 0;
	target.Position = UDim2.fromOffset(384, 344);
	target.Size = UDim2.fromOffset(360, 186);
	target.Parent = parent;

	const stroke = new Instance("UIStroke");
	stroke.Color = Color3.fromRGB(74, 222, 128);
	stroke.Thickness = 2;
	stroke.Parent = target;

	const padding = new Instance("UIPadding");
	padding.PaddingLeft = new UDim(0, 12);
	padding.PaddingRight = new UDim(0, 12);
	padding.PaddingTop = new UDim(0, 10);
	padding.PaddingBottom = new UDim(0, 10);
	padding.Parent = target;

	const layout = new Instance("UIListLayout");
	layout.SortOrder = Enum.SortOrder.LayoutOrder;
	layout.Padding = new UDim(0, 4);
	layout.Parent = target;

	const title = makeTextLabel(target, "PortalStoryTargetLabel", "Portal target frame");
	title.LayoutOrder = 0;
	title.Size = UDim2.fromOffset(330, 22);
	title.TextColor3 = Color3.fromRGB(187, 247, 208);

	return target;
}

const story = {
	name: "Portal",
	summary: "Renders @rovy/ui widgets into a separate target frame with portal().",
	controls,
	use: "Generic",
	render: (props: PortalStoryProps) => {
		const container = new Instance("Frame");
		container.Name = "RovyUiPortalStory";
		container.BackgroundTransparency = 1;
		container.Size = UDim2.fromScale(1, 1);
		container.Parent = props.target;

		createClippedHost(container);
		let portalTarget = createPortalTarget(container);
		let targetDeleted = false;

		const root = RovyUi.new(container, {
			inputService: createRovyInputServiceFromSignals(props.inputListener),
		});

		let currentControls = props.controls;
		let renderPortalContent = true;
		let count = 0;

		const render = (): void => {
			if (!targetDeleted) portalTarget.Visible = currentControls.Visible;

			RovyUi.start(root, () => {
				if (!currentControls.Visible) return;

				uiWindow(
					{
						title: "Portal Proof",
						position: new Vector2(64, 64),
						size: new Vector2(366, 286),
						resizable: true,
						scrollY: true,
					},
					() => {
						heading("Nested call site");
						label("This window calls portal(target, ...), but the widgets render in the green target frame.", {
							wrapped: true,
						});

						const enabled = checkbox("Render portal content", { checked: renderPortalContent });
						if (enabled.clicked()) renderPortalContent = !renderPortalContent;

						if (button("Increment counter").clicked()) count += 1;
						if (button("Delete external target").clicked() && !targetDeleted) {
							portalTarget.Destroy();
							targetDeleted = true;
						}
						if (button("Recreate target").clicked() && targetDeleted) {
							portalTarget = createPortalTarget(container);
							targetDeleted = false;
						}

						separator();
						label("The red frame below clips ordinary children. The green frame receives live Rovy widgets from portal.", {
							wrapped: true,
						});

						if (targetDeleted) {
							portal(portalTarget, () => {
								heading("This should not render");
								label("Portal target is destroyed");
							});
							label("The external target was deleted; portal children are skipped until it is recreated.", {
								wrapped: true,
							});
						} else if (renderPortalContent && currentControls.PortalContent) {
							portal(portalTarget, () => {
								heading("Portaled Widgets");
								label(`Parent target: ${portalTarget.Name}`);
								label(`Counter: ${count}`);
								if (button("Portaled Button").clicked()) count += 1;
								label("This text is outside the calling window, proving the target parent changed.", {
									wrapped: true,
								});
							});
						}
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
