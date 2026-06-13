import { widget, __useInstance, __useState, __useEffect, useHoverTarget, useInputService, usePointerDrag } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { createConnect } from "../createConnect";
import { udim, udim2 } from "../primitives";
import { isTopGuiTarget, pointInsideGuiObject } from "./shared";

export interface DragValueOptions {
	min?: number;
	max?: number;
	initial?: number;
	step?: number;
	label?: string;
}

interface DragValueRefs {
	frame: Frame;
	btn: TextButton;
	stroke: UIStroke;
	textBox: TextBox;
	textStroke: UIStroke;
	inputBeganConnection?: RBXScriptConnection;
	inputEndedConnection?: RBXScriptConnection;
	connection?: RBXScriptConnection;
	endConnection?: RBXScriptConnection;
	lastX?: number;
	startX?: number;
	didDrag?: boolean;
	pointerDown?: boolean;
	skipCommit?: boolean;
	currentValue?: number;
	isEditing?: boolean;
	editStartText?: string;
	endPointerDrag?: () => void;
}

/** @widget */
export const dragValue = widget((options: DragValueOptions = {}): number => {
	const min = options.min ?? 0;
	const max = options.max ?? 100;
	const step = options.step ?? 1;
	const initial = options.initial ?? min;
	const [value, setValue] = __useState("dragValue:value", initial);
	const [dragging, setDragging] = __useState("dragValue:dragging", false);
	const [hovered, setHovered] = __useState("dragValue:hovered", false);
	const [editing, setEditing] = __useState("dragValue:editing", false);

	const displayValueText = (rawValue: number): string => {
		if (step === 0) return tostring(rawValue);
		return tostring(math.round(rawValue * (1 / step)) / (1 / step));
	};

	const clampToStep = (rawValue: string): number | undefined => {
		const numericValue = tonumber(rawValue);
		if (numericValue === undefined) return undefined;
		let n = numericValue;
		if (step !== 0) n = math.round(n / step) * step;
		return math.clamp(n, min, max);
	};

	const commitEdit = (ref: DragValueRefs): void => {
		const nextValue = clampToStep(ref.textBox.Text);
		if (nextValue !== undefined) setValue(nextValue);
		setEditing(false);
	};

	const cancelEdit = (ref: DragValueRefs): void => {
		ref.textBox.Text = ref.editStartText ?? "";
		setEditing(false);
	};

	const beginEdit = (ref: DragValueRefs): void => {
		const text = displayValueText(ref.currentValue ?? initial);
		ref.editStartText = text;
		ref.textBox.Text = text;
		setEditing(true);
		ref.textBox.Visible = true;
		ref.btn.Visible = false;
		ref.textBox.CaptureFocus();
		ref.textBox.CursorPosition = ref.textBox.Text.size() + 1;
	};

	const refs = __useInstance("dragValue:instance", (rawRef) => {
		const ref = rawRef as unknown as DragValueRefs;
		const connectEvent = createConnect();
		const inputService = useInputService();
		const style = useStyle();
		const pointerDrag = usePointerDrag();
		ref.endPointerDrag = pointerDrag.end;

		ref.connection = undefined;
		ref.endConnection = undefined;
		ref.inputBeganConnection = undefined;
		ref.inputEndedConnection = undefined;
		ref.lastX = undefined;
		ref.startX = undefined;
		ref.didDrag = false;
		ref.pointerDown = false;
		ref.skipCommit = false;

		const finishDrag = (): void => {
			if (ref.pointerDown !== true) return;
			ref.pointerDown = false;
			pointerDrag.end();
			setDragging(false);

			if (ref.connection !== undefined) {
				ref.connection.Disconnect();
				ref.connection = undefined;
			}
			if (ref.endConnection !== undefined) {
				ref.endConnection.Disconnect();
				ref.endConnection = undefined;
			}

			if (ref.didDrag !== true) beginEdit(ref);
		};

		const beginDrag = (inputObj: InputObject, requirePointInside = false): void => {
			if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
			if (ref.pointerDown === true) return;
			if (requirePointInside && !pointInsideGuiObject(ref.btn, inputObj)) return;
			if (!isTopGuiTarget(ref.btn, inputObj, undefined, inputService)) return;
			if (inputService === undefined) return;

			ref.startX = inputObj.Position.X;
			ref.lastX = inputObj.Position.X;
			ref.didDrag = false;
			ref.pointerDown = true;
			pointerDrag.begin();

			if (ref.connection !== undefined) ref.connection.Disconnect();
			if (ref.endConnection !== undefined) ref.endConnection.Disconnect();

			ref.connection = connectEvent(inputService, "InputChanged", (...moveArgs: ReadonlyArray<unknown>) => {
				const moveInput = moveArgs[0] as InputObject;
				if (moveInput.UserInputType !== Enum.UserInputType.MouseMovement) return;

				const totalDx = moveInput.Position.X - (ref.startX ?? 0);
				if (ref.didDrag !== true && math.abs(totalDx) < 4) return;

				ref.didDrag = true;
				setDragging(true);

				const dx = moveInput.Position.X - (ref.lastX ?? 0);
				ref.lastX = moveInput.Position.X;

				setValue((current) => {
					const steps = math.round(dx / 4);
					const newVal = current + steps * step;
					return math.clamp(newVal, min, max);
				});
			});
			ref.endConnection = connectEvent(inputService, "InputEnded", (...endArgs: ReadonlyArray<unknown>) => {
				const endInput = endArgs[0] as InputObject;
				if (endInput.UserInputType !== Enum.UserInputType.MouseButton1) return;
				finishDrag();
			});
		};

		if (inputService !== undefined) {
			ref.inputBeganConnection = connectEvent(inputService, "InputBegan", (...args: ReadonlyArray<unknown>) => {
				beginDrag(args[0] as InputObject, true);
			});
			ref.inputEndedConnection = connectEvent(inputService, "InputEnded", (...args: ReadonlyArray<unknown>) => {
				const inputObj = args[0] as InputObject;
				if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
				finishDrag();
			});
		}

		return create("Frame", {
			[rawRef as never]: "frame",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, style.itemHeight),
			0: create("TextButton", {
				[rawRef as never]: "btn",
				BackgroundColor3: style.widgetInactiveBgColor,
				BackgroundTransparency: 0,
				BorderSizePixel: 0,
				Font: Enum.Font.Code,
				TextColor3: style.textColor,
				TextSize: style.textSize,
				Size: udim2(1, 0, 1, 0),
				AutoButtonColor: false,
				0: create("UICorner", { CornerRadius: udim(0, style.cornerRadius) }),
				1: create("UIStroke", {
					[rawRef as never]: "stroke",
					Color: style.strokeInactiveColor,
					Transparency: style.strokeInactiveTransparency,
					Thickness: style.strokeThickness, ApplyStrokeMode: Enum.ApplyStrokeMode.Border,
				}),
					InputBegan: (...args: ReadonlyArray<unknown>) => {
						beginDrag(args[0] as InputObject);
				},
				InputEnded: (...args: ReadonlyArray<unknown>) => {
					const inputObj = args[0] as InputObject;
					if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
					finishDrag();
				},
			}),
			1: create("TextBox", {
				[rawRef as never]: "textBox",
				BackgroundColor3: style.extremeBgColor,
				BackgroundTransparency: 0,
				BorderSizePixel: 0,
				ClearTextOnFocus: false,
				Font: Enum.Font.Code,
				TextColor3: style.strongTextColor,
				TextSize: style.textSize,
				TextXAlignment: Enum.TextXAlignment.Left,
				TextYAlignment: Enum.TextYAlignment.Center,
				Size: udim2(1, 0, 1, 0),
				Visible: false,
				0: create("UICorner", { CornerRadius: udim(0, style.cornerRadius) }),
				1: create("UIStroke", {
					[rawRef as never]: "textStroke",
					Color: style.accentColor,
					Transparency: 0,
					Thickness: style.strokeThickness, ApplyStrokeMode: Enum.ApplyStrokeMode.Border,
				}),
				2: create("UIPadding", {
					PaddingLeft: udim(0, 4),
					PaddingRight: udim(0, 4),
				}),
				InputBegan: (...args: ReadonlyArray<unknown>) => {
					const inputObj = args[0] as InputObject;
					if (inputObj.KeyCode === Enum.KeyCode.Escape) {
						ref.skipCommit = true;
						cancelEdit(ref);
						ref.textBox.ReleaseFocus(false);
					}
				},
				FocusLost: (...args: ReadonlyArray<unknown>) => {
					const enterPressed = args[0] as boolean;
					if (ref.skipCommit === true) {
						ref.skipCommit = false;
						return;
					}
					if (enterPressed || ref.isEditing === true) commitEdit(ref);
				},
			}),
		});
	}) as unknown as DragValueRefs;

	useHoverTarget(refs.btn, setHovered, `DragValue: ${options.label ?? "value"}`);

	__useEffect("dragValue:effect", () => {
		return () => {
			if (refs.pointerDown === true) {
				refs.pointerDown = false;
				refs.endPointerDrag?.();
			}
			if (refs.connection !== undefined) {
				refs.connection.Disconnect();
				refs.connection = undefined;
			}
			if (refs.endConnection !== undefined) {
				refs.endConnection.Disconnect();
				refs.endConnection = undefined;
			}
			if (refs.inputBeganConnection !== undefined) {
				refs.inputBeganConnection.Disconnect();
				refs.inputBeganConnection = undefined;
			}
			if (refs.inputEndedConnection !== undefined) {
				refs.inputEndedConnection.Disconnect();
				refs.inputEndedConnection = undefined;
			}
		};
	});

	const style = useStyle();
	const currentValue = math.clamp(value, min, max);
	const displayValue = displayValueText(currentValue);
	refs.currentValue = currentValue;
	refs.isEditing = editing;

	if (dragging) {
		refs.btn.BackgroundColor3 = style.widgetActiveBgColor;
		refs.btn.BackgroundTransparency = 0;
		refs.stroke.Color = style.strokeActiveColor;
		refs.stroke.Transparency = style.strokeActiveTransparency;
	} else if (hovered) {
		refs.btn.BackgroundColor3 = style.widgetHoveredBgColor;
		refs.btn.BackgroundTransparency = 0;
		refs.stroke.Color = style.strokeHoveredColor;
		refs.stroke.Transparency = style.strokeHoveredTransparency;
	} else {
		refs.btn.BackgroundColor3 = style.widgetInactiveBgColor;
		refs.btn.BackgroundTransparency = 0;
		refs.stroke.Color = style.strokeInactiveColor;
		refs.stroke.Transparency = style.strokeInactiveTransparency;
	}

	refs.textBox.BackgroundColor3 = style.extremeBgColor;
	refs.textBox.BackgroundTransparency = 0;
	refs.textBox.TextColor3 = style.strongTextColor;
	refs.textBox.TextSize = style.textSize;
	refs.textStroke.Color = style.accentColor;
	refs.textStroke.Transparency = 0;

	if (options.label !== undefined) {
		refs.btn.Text = `${options.label}: ${displayValue}`;
	} else {
		refs.btn.Text = displayValue;
	}

	refs.btn.Visible = !editing;
	refs.textBox.Visible = editing;

	return currentValue;
}, "@rovy/ui/dragValue");
