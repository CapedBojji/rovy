import { createRovyInputServiceFromSignals, type RovyInputSignals } from "./input";
import { newRoot, start } from "./runtime";

export interface RovyUiStoryRenderProps<TControls extends object> {
	controls: TControls;
	target: Frame;
}

export interface RovyUiStoryInputProps<TControls extends object> {
	controls: TControls;
	target: Frame;
	inputListener: RovyInputSignals;
	subscribe: (listener: (values: TControls, info: unknown) => void) => () => void;
}

export interface RovyUiStoryOptions<TControls extends object> {
	name?: string;
	summary?: string;
	controls?: unknown;
	render: (props: RovyUiStoryRenderProps<TControls>) => void;
}

export function createRovyUiStory<TControls extends object = {}>(
	story: RovyUiStoryOptions<TControls>,
): Omit<RovyUiStoryOptions<TControls>, "render"> & {
	use: "Generic";
	render: (props: RovyUiStoryInputProps<TControls>) => () => void;
} {
	return {
		name: story.name,
		summary: story.summary,
		controls: story.controls,
		use: "Generic",
		render: (props) => {
			const container = new Instance("Frame");
			container.Name = "RovyUiStoryRoot";
			container.BackgroundTransparency = 1;
			container.Size = UDim2.fromScale(1, 1);
			container.Parent = props.target;

			const root = newRoot(container, {
				inputService: createRovyInputServiceFromSignals(props.inputListener),
			});

			let controls = props.controls;
			const render = (): void => {
				start(root, () => {
					story.render({
						controls,
						target: container,
					});
				});
			};

			render();

			const [runOk, runService] = pcall(() => game.GetService("RunService"));
			const connection = runOk ? (runService as RunService).RenderStepped.Connect(render) : undefined;
			const unsubscribe = props.subscribe((values) => {
				controls = values;
				render();
			});

			return () => {
				unsubscribe();
				connection?.Disconnect();
				start(root, () => {});
				container.Destroy();
			};
		},
	};
}
