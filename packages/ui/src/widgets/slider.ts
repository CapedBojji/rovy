import { widget, __useInstance, __useState, __useEffect } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { createConnect } from "../createConnect";
import { udim, udim2, v2 } from "../primitives";

export interface SliderOptions {
	min?: number;
	max?: number;
	initial?: number;
	label?: string;
	width?: number;
}

interface SliderRefs {
	frame: Frame;
	track: TextButton;
	fill: Frame;
	grab: TextButton;
	valueLabel: TextLabel;
	connection?: RBXScriptConnection;
}

function tryGetService(name: string): Instance | undefined {
	const [ok, svc] = pcall(() => game.GetService(name as keyof Services));
	return ok ? svc : undefined;
}

/** @widget */
export const slider = widget((options: SliderOptions | number = {}): number => {
	const opts = typeIs(options, "number") ? ({ max: options } as SliderOptions) : options;

	const min = opts.min ?? 0;
	const max = opts.max ?? 1;
	const initial = opts.initial ?? min;
	const initPercent = (initial - min) / (max - min);
	const [percentageValue, setPercentageValue] = __useState("slider:value", initPercent);

	const refs = __useInstance("slider:instance", (rawRef) => {
		const ref = rawRef as unknown as SliderRefs;
		const connectEvent = createConnect();
		const UserInputService = tryGetService("UserInputService");
		const style = useStyle();
		const grabSize = 10;
		const trackHeight = 4;

		ref.connection = undefined;

		const startDrag = (): void => {
			if (UserInputService === undefined) return;
			if (ref.connection !== undefined) ref.connection.Disconnect();
			ref.connection = connectEvent(UserInputService, "InputChanged", (...args: ReadonlyArray<unknown>) => {
				const moveInput = args[0] as InputObject;
				if (moveInput.UserInputType !== Enum.UserInputType.MouseMovement) return;
				const trackFrame = ref.track;
				const trackWidth = trackFrame.AbsoluteSize.X;
				const x = math.clamp(moveInput.Position.X - trackFrame.AbsolutePosition.X, 0, trackWidth);
				setPercentageValue(x / trackWidth);
			});
		};

		return create("Frame", {
			[rawRef as never]: "frame",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, style.itemHeight),
			0: create("TextButton", {
				[rawRef as never]: "track",
				BackgroundColor3: style.frameBgColor,
				BackgroundTransparency: style.frameBgTransparency,
				BorderSizePixel: 0,
				Text: "",
				AutoButtonColor: false,
				AnchorPoint: v2(0, 0.5),
				Position: udim2(0, grabSize / 2, 0.5, 0),
				Size: udim2(1, -grabSize, 0, trackHeight),
				0: create("UICorner", { CornerRadius: udim(0, 2) }),
				1: create("Frame", {
					[rawRef as never]: "fill",
					BackgroundColor3: style.sliderGrabColor,
					BackgroundTransparency: 0,
					BorderSizePixel: 0,
					Size: udim2(0, 0, 1, 0),
					0: create("UICorner", { CornerRadius: udim(0, 2) }),
				}),
				InputBegan: (...args: ReadonlyArray<unknown>) => {
					const inputObj = args[0] as InputObject;
					if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
					const trackFrame = ref.track;
					const trackWidth = trackFrame.AbsoluteSize.X;
					const x = math.clamp(inputObj.Position.X - trackFrame.AbsolutePosition.X, 0, trackWidth);
					setPercentageValue(x / trackWidth);
					startDrag();
				},
				InputEnded: (...args: ReadonlyArray<unknown>) => {
					const inputObj = args[0] as InputObject;
					if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
					if (ref.connection !== undefined) {
						ref.connection.Disconnect();
						ref.connection = undefined;
					}
				},
			}),
			1: create("TextButton", {
				[rawRef as never]: "grab",
				BackgroundColor3: style.sliderGrabColor,
				BorderSizePixel: 0,
				Text: "",
				Size: udim2(0, grabSize, 0, grabSize),
				AnchorPoint: v2(0.5, 0.5),
				Position: udim2(0, 0, 0.5, 0),
				AutoButtonColor: false,
				0: create("UICorner", { CornerRadius: udim(1, 0) }),
				InputBegan: (...args: ReadonlyArray<unknown>) => {
					const inputObj = args[0] as InputObject;
					if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
					startDrag();
				},
				InputEnded: (...args: ReadonlyArray<unknown>) => {
					const inputObj = args[0] as InputObject;
					if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
					if (ref.connection !== undefined) {
						ref.connection.Disconnect();
						ref.connection = undefined;
					}
				},
			}),
			2: create("TextLabel", {
				[rawRef as never]: "valueLabel",
				BackgroundTransparency: 1,
				Font: Enum.Font.Code,
				TextColor3: style.textColor,
				TextSize: style.textSize,
				TextXAlignment: Enum.TextXAlignment.Center,
				Size: udim2(1, 0, 1, 0),
				ZIndex: 2,
			}),
		});
	}) as unknown as SliderRefs;

	__useEffect("slider:effect", () => {
		return () => {
			if (refs.connection !== undefined) {
				refs.connection.Disconnect();
				refs.connection = undefined;
			}
		};
	});

	refs.grab.Position = udim2(percentageValue, 10 * (0.5 - percentageValue), 0.5, 0);
	refs.fill.Size = udim2(percentageValue, 0, 1, 0);

	const value = percentageValue * (max - min) + min;
	const displayValue = math.round(value * 100) / 100;

	if (opts.label !== undefined) {
		refs.valueLabel.Text = `${opts.label}: ${displayValue}`;
	} else {
		refs.valueLabel.Text = tostring(displayValue);
	}

	return value;
}, "@rovy/ui/slider");
