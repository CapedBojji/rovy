import { widget, __useInstance, __useState, __useEffect, usePointerDrag } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { createConnect } from "../createConnect";
import { udim, udim2, v2 } from "../primitives";
import { isTopGuiTarget } from "./shared";

export interface SliderOptions {
	min?: number;
	max?: number;
	initial?: number;
	label?: string;
	width?: number;
	minWidth?: number;
	showValueBox?: boolean;
	valueBoxWidth?: number;
	suffix?: string;
}

interface SliderRefs {
	frame: Frame;
	track: TextButton;
	fill: Frame;
	grab: TextButton;
	valueBox: TextBox;
	valueBoxStroke: UIStroke;
	connection?: RBXScriptConnection;
	dragConnection?: RBXScriptConnection;
	dragStartX?: number;
	dragStartValue?: number;
	currentPercent?: number;
	rangeMin?: number;
	rangeMax?: number;
	isEditing?: boolean;
	didDrag?: boolean;
	skipCommit?: boolean;
	pointerDragging?: boolean;
	endPointerDrag?: () => void;
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
	const [editing, setEditing] = __useState("slider:editing", false);
	const [focused, setFocused] = __useState("slider:focused", false);

	const showValueBox = opts.showValueBox !== false;
	const valueBoxWidth = opts.valueBoxWidth ?? 56;
	const gap = 6;
	const suffix = opts.suffix ?? "";

	const formatValue = (raw: number): string => {
		const rounded = math.round(raw * 100) / 100;
		const intRounded = math.round(rounded);
		const txt = math.abs(rounded - intRounded) < 0.0001 ? tostring(intRounded) : tostring(rounded);
		return `${txt}${suffix}`;
	};

	const refs = __useInstance("slider:instance", (rawRef) => {
		const ref = rawRef as unknown as SliderRefs;
		const connectEvent = createConnect();
		const UserInputService = tryGetService("UserInputService");
		const style = useStyle();
		const pointerDrag = usePointerDrag();
		const grabWidth = 12;
		const grabHeight = 16;
		const trackHeight = 10;

		ref.connection = undefined;
		ref.dragConnection = undefined;
		ref.pointerDragging = false;
		ref.endPointerDrag = pointerDrag.end;

		const beginPointerDrag = (): void => {
			if (ref.pointerDragging === true) return;
			ref.pointerDragging = true;
			pointerDrag.begin();
		};

		const endPointerDrag = (): void => {
			if (ref.pointerDragging !== true) return;
			ref.pointerDragging = false;
			pointerDrag.end();
		};

		const startTrackDrag = (): void => {
			if (UserInputService === undefined) return;
			beginPointerDrag();
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

		const startValueDrag = (startInput: InputObject): void => {
			if (UserInputService === undefined) return;
			beginPointerDrag();
			if (ref.dragConnection !== undefined) ref.dragConnection.Disconnect();
			const curPct = ref.currentPercent ?? 0;
			const curMin = ref.rangeMin ?? 0;
			const curMax = ref.rangeMax ?? 1;
			ref.dragStartX = startInput.Position.X;
			ref.dragStartValue = curPct * (curMax - curMin) + curMin;
			ref.didDrag = false;
			ref.dragConnection = connectEvent(UserInputService, "InputChanged", (...args: ReadonlyArray<unknown>) => {
				const moveInput = args[0] as InputObject;
				if (moveInput.UserInputType !== Enum.UserInputType.MouseMovement) return;
				const dx = moveInput.Position.X - (ref.dragStartX ?? 0);
				if (!ref.didDrag && math.abs(dx) < 4) return;
				ref.didDrag = true;
				const rMin = ref.rangeMin ?? 0;
				const rMax = ref.rangeMax ?? 1;
				const range = rMax - rMin;
				const speed = range > 0 ? math.max(range / 200, 0.01) : 1;
				const newVal = math.clamp((ref.dragStartValue ?? rMin) + dx * speed, rMin, rMax);
				setPercentageValue(range > 0 ? (newVal - rMin) / range : 0);
			});
		};

		const boxOffset = showValueBox ? valueBoxWidth + gap : 0;

		const minWidth = opts.minWidth ?? 120;
		const explicitWidth = opts.width;
		return create("Frame", {
			[rawRef as never]: "frame",
			BackgroundTransparency: 1,
			Size: explicitWidth !== undefined ? udim2(0, explicitWidth, 0, style.itemHeight) : udim2(1, 0, 0, style.itemHeight),
			3: create("UISizeConstraint", {
				MinSize: v2(minWidth, 0),
			}),
			0: create("TextButton", {
				[rawRef as never]: "track",
				BackgroundColor3: style.widgetInactiveBgColor,
				BackgroundTransparency: 0,
				BorderSizePixel: 0,
				Text: "",
				AutoButtonColor: false,
				AnchorPoint: v2(0, 0.5),
				Position: udim2(0, grabWidth / 2, 0.5, 0),
				Size: udim2(1, -grabWidth - boxOffset, 0, trackHeight),
				ClipsDescendants: false,
				0: create("UICorner", { CornerRadius: udim(0, 3) }),
				1: create("Frame", {
					[rawRef as never]: "fill",
					BackgroundTransparency: 1,
					BorderSizePixel: 0,
					Size: udim2(0, 0, 1, 0),
					0: create("UICorner", { CornerRadius: udim(0, 3) }),
				}),
				2: create("TextButton", {
					[rawRef as never]: "grab",
					BackgroundColor3: style.sliderGrabColor,
					BorderSizePixel: 0,
					Text: "",
					Size: udim2(0, grabWidth, 0, grabHeight),
					AnchorPoint: v2(0.5, 0.5),
					Position: udim2(0, 0, 0.5, 0),
					AutoButtonColor: false,
					ZIndex: 3,
					0: create("UICorner", { CornerRadius: udim(0, 3) }),
					2: create("UIStroke", {
						Color: style.strokeInactiveColor,
						Transparency: style.strokeInactiveTransparency,
						Thickness: style.strokeThickness,
						ApplyStrokeMode: Enum.ApplyStrokeMode.Border,
					}),
						InputBegan: (...args: ReadonlyArray<unknown>) => {
							const inputObj = args[0] as InputObject;
							if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
							if (!isTopGuiTarget(ref.grab)) return;
							startTrackDrag();
						},
					InputEnded: (...args: ReadonlyArray<unknown>) => {
						const inputObj = args[0] as InputObject;
						if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
						if (ref.connection !== undefined) {
							ref.connection.Disconnect();
							ref.connection = undefined;
						}
						endPointerDrag();
					},
				}),
					InputBegan: (...args: ReadonlyArray<unknown>) => {
						const inputObj = args[0] as InputObject;
						if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
						if (!isTopGuiTarget(ref.track)) return;
						const trackFrame = ref.track;
					const trackWidth = trackFrame.AbsoluteSize.X;
					const x = math.clamp(inputObj.Position.X - trackFrame.AbsolutePosition.X, 0, trackWidth);
					setPercentageValue(x / trackWidth);
					startTrackDrag();
				},
				InputEnded: (...args: ReadonlyArray<unknown>) => {
					const inputObj = args[0] as InputObject;
					if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
					if (ref.connection !== undefined) {
						ref.connection.Disconnect();
						ref.connection = undefined;
					}
					endPointerDrag();
				},
			}),
			2: create("TextBox", {
				[rawRef as never]: "valueBox",
				BackgroundColor3: style.widgetInactiveBgColor,
				BackgroundTransparency: 0,
				BorderSizePixel: 0,
				Font: Enum.Font.Code,
				TextColor3: style.textColor,
				TextSize: style.textSize,
				TextXAlignment: Enum.TextXAlignment.Center,
				TextYAlignment: Enum.TextYAlignment.Center,
				ClearTextOnFocus: false,
				TextEditable: false,
				Size: udim2(0, valueBoxWidth, 1, 0),
				AnchorPoint: v2(1, 0.5),
				Position: udim2(1, 0, 0.5, 0),
				Visible: showValueBox,
				0: create("UICorner", { CornerRadius: udim(0, style.cornerRadius) }),
				1: create("UIStroke", {
					[rawRef as never]: "valueBoxStroke",
					Color: style.strokeInactiveColor,
					Transparency: style.strokeInactiveTransparency,
					Thickness: style.strokeThickness,
					ApplyStrokeMode: Enum.ApplyStrokeMode.Border,
				}),
				2: create("UIPadding", {
					PaddingLeft: udim(0, 4),
					PaddingRight: udim(0, 4),
				}),
					InputBegan: (...args: ReadonlyArray<unknown>) => {
						const inputObj = args[0] as InputObject;
						if (inputObj.UserInputType === Enum.UserInputType.MouseButton1) {
							if (!isTopGuiTarget(ref.valueBox)) return;
							if (!ref.valueBox.TextEditable) startValueDrag(inputObj);
					} else if (inputObj.KeyCode === Enum.KeyCode.Escape) {
						ref.skipCommit = true;
						setEditing(false);
						ref.valueBox.ReleaseFocus(false);
					}
				},
				InputEnded: (...args: ReadonlyArray<unknown>) => {
					const inputObj = args[0] as InputObject;
					if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
					if (ref.dragConnection !== undefined) {
						ref.dragConnection.Disconnect();
						ref.dragConnection = undefined;
					}
						endPointerDrag();
						if (ref.didDrag !== true) {
							if (!isTopGuiTarget(ref.valueBox)) return;
							ref.valueBox.TextEditable = true;
						setEditing(true);
						ref.valueBox.CaptureFocus();
						ref.valueBox.CursorPosition = ref.valueBox.Text.size() + 1;
					}
				},
					Focused: () => {
						if (!isTopGuiTarget(ref.valueBox)) {
							ref.valueBox.ReleaseFocus(false);
							return;
						}
						setFocused(true);
					},
				FocusLost: (...focusArgs: ReadonlyArray<unknown>) => {
					setFocused(false);
					const enterPressed = focusArgs[0] as boolean;
					ref.valueBox.TextEditable = false;
					if (ref.skipCommit === true) {
						ref.skipCommit = false;
						setEditing(false);
						return;
					}
					if (enterPressed || ref.isEditing === true) {
						const cleaned = ref.valueBox.Text.gsub(`[^%-%.%d]`, "")[0] as string;
						const parsed = tonumber(cleaned);
						if (parsed !== undefined) {
							const rangeMin = ref.rangeMin ?? 0;
							const rangeMax = ref.rangeMax ?? 1;
							const range = rangeMax - rangeMin;
							const clamped = math.clamp(parsed, rangeMin, rangeMax);
							setPercentageValue(range > 0 ? (clamped - rangeMin) / range : 0);
						}
					}
					setEditing(false);
				},
			}),
		});
	}) as unknown as SliderRefs;

	__useEffect("slider:effect", () => {
		return () => {
			if (refs.connection !== undefined) {
				refs.connection.Disconnect();
				refs.connection = undefined;
			}
			if (refs.dragConnection !== undefined) {
				refs.dragConnection.Disconnect();
				refs.dragConnection = undefined;
			}
			if (refs.pointerDragging === true) {
				refs.pointerDragging = false;
				refs.endPointerDrag?.();
			}
		};
	});

	refs.currentPercent = percentageValue;
	refs.rangeMin = min;
	refs.rangeMax = max;
	refs.isEditing = editing;

	refs.grab.Position = udim2(percentageValue, 0, 0.5, 0);
	refs.fill.Size = udim2(percentageValue, 0, 1, 0);

	const value = percentageValue * (max - min) + min;

	const style = useStyle();
	refs.valueBox.Visible = showValueBox;
	if (showValueBox && !editing) {
		refs.valueBox.Text = formatValue(value);
	}
	if (refs.valueBoxStroke !== undefined) {
		if (focused) {
			refs.valueBoxStroke.Color = style.accentColor;
			refs.valueBoxStroke.Transparency = 0;
		} else {
			refs.valueBoxStroke.Color = style.strokeInactiveColor;
			refs.valueBoxStroke.Transparency = style.strokeInactiveTransparency;
		}
	}

	return value;
}, "@rovy/ui/slider");
