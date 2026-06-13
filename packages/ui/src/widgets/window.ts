import {
	widget,
	__scope,
	__useInstance,
	__useState,
	__useEffect,
	useRootInstance,
	provideContext,
	useHoverTarget,
	useInputService,
	usePointerDrag,
} from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { createConnect } from "../createConnect";
import { c, udim, udim2, v2 } from "../primitives";
import * as contexts from "../contexts";
import { WINDOW_ATTRIBUTE } from "../windowConstants";
import { isTopGuiTarget, makeCornerPerSide, makeShadow, markHitTestSurface, pointInsideGuiObject } from "./shared";

export interface WindowOptions {
	title?: string;
	closable?: boolean;
	minimizable?: boolean;
	movable?: boolean;
	resizable?: boolean;
	scrollX?: boolean;
	scrollY?: boolean;
	size?: Vector2;
	position?: Vector2;
	visible?: boolean;
	onClose?: () => void;
}
export interface WindowHandle {
	closed(): boolean;
	minimized(): boolean;
}

interface WindowRefs {
	frame: Frame;
	border: UIStroke;
	titleBar: TextButton;
	title: TextLabel;
	minimize: TextButton;
	close: TextButton;
	container: ScrollingFrame;
	resizeGrip: TextButton;
	inputBeganConnection?: RBXScriptConnection;
	inputEndedConnection?: RBXScriptConnection;
	dragConnection?: RBXScriptConnection;
	resizeConnection?: RBXScriptConnection;
	lastTitleClickTime?: number;
	dragStartPosition?: Vector3;
	dragMoved?: boolean;
	ignoreTitleClick?: boolean;
	pointerDragging?: boolean;
	endPointerDrag?: () => void;
}

const MIN_SIZE = v2(120, 80);
const DOUBLE_CLICK_TIME = 0.3;
const DRAG_THRESHOLD = 4;

function tryGetService(name: string): Instance | undefined {
	const [ok, svc] = pcall(() => game.GetService(name as keyof Services));
	return ok ? svc : undefined;
}

/** @widget */
export const window = widget((options: string | WindowOptions, fn: () => void): WindowHandle => {
	const opts = typeIs(options, "string") ? ({ title: options } as WindowOptions) : (options ?? {});
	const [closed, setClosed] = __useState("window:closed", false);
	const [minimized, setMinimized] = __useState("window:minimized", false);
	const [size, setSize] = __useState<Vector2>("window:size", opts.size ?? v2(300, 400));

	const refs = __useInstance("window:instance", (rawRef) => {
		const ref = rawRef as unknown as WindowRefs;
		const style = useStyle();
			const connectEvent = createConnect();
			const GuiService = tryGetService("GuiService") as GuiService | undefined;
			const inputService = useInputService();
			const pointerDrag = usePointerDrag();

		ref.dragConnection = undefined;
		ref.resizeConnection = undefined;
		ref.inputBeganConnection = undefined;
		ref.inputEndedConnection = undefined;
		ref.lastTitleClickTime = 0;
			ref.dragStartPosition = undefined;
			ref.dragMoved = false;
			ref.ignoreTitleClick = false;
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

			const finishTitleDrag = (inputObj: InputObject): void => {
				if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
				if (ref.dragStartPosition === undefined && ref.ignoreTitleClick !== true) return;

				if (ref.dragConnection !== undefined) {
					ref.dragConnection.Disconnect();
					ref.dragConnection = undefined;
				}
				endPointerDrag();

				if (ref.ignoreTitleClick === true) {
					ref.ignoreTitleClick = false;
					ref.dragStartPosition = undefined;
					ref.dragMoved = false;
					return;
				}

				if (ref.minimize.Visible && ref.dragMoved !== true) {
					const now = os.clock();
					if (now - (ref.lastTitleClickTime ?? 0) <= DOUBLE_CLICK_TIME) {
						setMinimized((prev) => !prev);
						ref.lastTitleClickTime = 0;
					} else {
						ref.lastTitleClickTime = now;
					}
				}

				ref.dragStartPosition = undefined;
				ref.dragMoved = false;
			};

			const finishResize = (inputObj: InputObject): void => {
				if (inputObj.UserInputType !== Enum.UserInputType.MouseButton1) return;
				if (ref.resizeConnection !== undefined) {
					ref.resizeConnection.Disconnect();
					ref.resizeConnection = undefined;
				}
				endPointerDrag();
			};

			const beginTitleDrag = (clickInput: InputObject, requirePointInside = false): void => {
				if (clickInput.UserInputType !== Enum.UserInputType.MouseButton1) return;
				if (ref.dragStartPosition !== undefined) return;
				if (requirePointInside && !pointInsideGuiObject(ref.titleBar, clickInput)) return;
				if (!isTopGuiTarget(ref.titleBar, clickInput, undefined, inputService)) {
					ref.ignoreTitleClick = true;
					return;
				}

				if (pointInsideGuiObject(ref.minimize, clickInput) || pointInsideGuiObject(ref.close, clickInput)) {
					ref.ignoreTitleClick = true;
					return;
				}

				ref.ignoreTitleClick = false;
				ref.dragStartPosition = clickInput.Position;
				ref.dragMoved = false;

				if (ref.frame.GetAttribute("movable") !== true) return;
				if (inputService === undefined) return;
				beginPointerDrag();

				let lastMousePosition = clickInput.Position;

				const parent = ref.frame.Parent;
				if (
					parent !== undefined &&
					parent.FindFirstChildWhichIsA("UIGridStyleLayout") !== undefined &&
					!parent.IsA("ScreenGui")
				) {
					const beforePosition = ref.frame.AbsolutePosition;
					const screenGui = ref.frame.FindFirstAncestorOfClass("ScreenGui");
					let bp = beforePosition;
					if (screenGui !== undefined && screenGui.IgnoreGuiInset && GuiService !== undefined) {
						const [guiInset] = GuiService.GetGuiInset();
						bp = bp.add(guiInset);
					}
					if (screenGui !== undefined) {
						ref.frame.Parent = screenGui;
						ref.frame.Position = udim2(0, bp.X, 0, bp.Y);
					}
				}

				if (ref.dragConnection !== undefined) ref.dragConnection.Disconnect();
				ref.dragConnection = connectEvent(inputService, "InputChanged", (...moveArgs: ReadonlyArray<unknown>) => {
					const moveInput = moveArgs[0] as InputObject;
					if (moveInput.UserInputType !== Enum.UserInputType.MouseMovement) return;

					if (ref.dragStartPosition !== undefined) {
						const dragDistance = v2(
							moveInput.Position.X - ref.dragStartPosition.X,
							moveInput.Position.Y - ref.dragStartPosition.Y,
						).Magnitude;
						if (dragDistance > DRAG_THRESHOLD) ref.dragMoved = true;
					}

					const delta = lastMousePosition.sub(moveInput.Position);
					lastMousePosition = moveInput.Position;
					ref.frame.Position = ref.frame.Position.sub(new UDim2(0, delta.X, 0, delta.Y));
				});
			};

			const beginResize = (clickInput: InputObject, requirePointInside = false): void => {
				if (clickInput.UserInputType !== Enum.UserInputType.MouseButton1) return;
				if (ref.resizeConnection !== undefined) return;
				if (requirePointInside && !pointInsideGuiObject(ref.resizeGrip, clickInput)) return;
				if (!isTopGuiTarget(ref.resizeGrip, clickInput, undefined, inputService)) return;
				if (inputService === undefined) return;
				beginPointerDrag();

				const initMousePos = clickInput.Position;
				const initSize = ref.frame.AbsoluteSize;

				ref.resizeConnection = connectEvent(inputService, "InputChanged", (...moveArgs: ReadonlyArray<unknown>) => {
					const moveInput = moveArgs[0] as InputObject;
					if (moveInput.UserInputType !== Enum.UserInputType.MouseMovement) return;

					const delta = v2(moveInput.Position.X - initMousePos.X, moveInput.Position.Y - initMousePos.Y);
					let newSize = initSize.add(delta);
					newSize = v2(math.max(MIN_SIZE.X, newSize.X), math.max(MIN_SIZE.Y, newSize.Y));

					const tbh = useStyle().titleBarHeight;
					ref.frame.Size = udim2(0, newSize.X, 0, newSize.Y);
					ref.container.Size = udim2(1, 0, 0, newSize.Y - tbh);
					setSize(newSize);
				});
			};

			if (inputService !== undefined) {
				ref.inputBeganConnection = connectEvent(inputService, "InputBegan", (...args: ReadonlyArray<unknown>) => {
					const inputObj = args[0] as InputObject;
					if (pointInsideGuiObject(ref.resizeGrip, inputObj)) beginResize(inputObj, true);
					else beginTitleDrag(inputObj, true);
				});
				ref.inputEndedConnection = connectEvent(inputService, "InputEnded", (...args: ReadonlyArray<unknown>) => {
					const inputObj = args[0] as InputObject;
					finishTitleDrag(inputObj);
					finishResize(inputObj);
				});
			}

		const initialSize = opts.size ?? v2(300, 400);
		const titleBarHeight = style.titleBarHeight;
			const contentHeight = initialSize.Y - titleBarHeight;
			const padX = style.windowPadding.X;
			const padY = style.windowPadding.Y;

			// LayoutOrder is set on inner title-bar children (1/2/3) intentionally;
			// the returned root is assigned LayoutOrder by the runtime, never here.
			create("Frame", {
				[rawRef as never]: "frame",
			BackgroundColor3: style.windowBgColor,
			BackgroundTransparency: style.windowBgTransparency,
			BorderSizePixel: 0,
			Active: true,
			InputSink: Enum.InputSink.All,
			ZIndex: 100,
			Position: udim2(
				0,
				opts.position?.X ?? 60,
				0,
				opts.position?.Y ?? 60,
				),
				Size: udim2(0, initialSize.X, 0, initialSize.Y),
				ClipsDescendants: false,
				0: makeCornerPerSide({
					tl: style.windowCornerRadius,
					tr: style.windowCornerRadius,
				bl: style.windowCornerRadius,
				br: style.windowCornerRadius,
			}),
			1: create("UIStroke", {
				[rawRef as never]: "border",
				Color: style.borderColor,
				Transparency: style.borderTransparency,
				Thickness: style.strokeThickness, ApplyStrokeMode: Enum.ApplyStrokeMode.Border,
			}),
			5: makeShadow(style) ?? create("Folder", {}),
			2: create("TextButton", {
				[rawRef as never]: "titleBar",
				BackgroundColor3: style.titleBgColor,
				BackgroundTransparency: 0,
				BorderSizePixel: 0,
				Size: udim2(1, 0, 0, titleBarHeight),
					Position: udim2(0, 0, 0, 0),
					Text: "",
					Active: true,
					ZIndex: 101,
					0: create("UIListLayout", {
					FillDirection: Enum.FillDirection.Horizontal,
					VerticalAlignment: Enum.VerticalAlignment.Center,
					SortOrder: Enum.SortOrder.LayoutOrder,
					Padding: udim(0, 4),
				}),
				1: create("UIPadding", {
					PaddingLeft: udim(0, padX),
					PaddingRight: udim(0, 4),
				}),
				6: makeCornerPerSide({
					tl: style.windowCornerRadius,
					tr: style.windowCornerRadius,
					bl: 0,
					br: 0,
				}),
				2: create("TextLabel", {
					[rawRef as never]: "title",
					BackgroundTransparency: 1,
					Font: Enum.Font.Code,
					TextColor3: style.strongTextColor,
					TextSize: style.textSize,
					TextXAlignment: Enum.TextXAlignment.Left,
					TextYAlignment: Enum.TextYAlignment.Center,
					Size: udim2(0, 0, 1, 0),
					LayoutOrder: 1,
					ZIndex: 102,
					0: create("UIFlexItem", { FlexMode: Enum.UIFlexMode.Fill }),
				}),
				3: create("TextButton", {
					[rawRef as never]: "minimize",
					BackgroundTransparency: 1,
					Font: Enum.Font.Code,
					TextColor3: style.weakTextColor,
					TextSize: style.textSize + 2,
					Size: udim2(0, 16, 0, 16),
						Text: "−",
						LayoutOrder: 2,
						Visible: false,
						ZIndex: 102,
							Activated: () => {
								if (!isTopGuiTarget(ref.minimize, undefined, undefined, inputService)) return;
								setMinimized((prev) => !prev);
							},
				}),
				4: create("TextButton", {
					[rawRef as never]: "close",
					BackgroundTransparency: 1,
					Font: Enum.Font.Code,
					TextColor3: style.weakTextColor,
					TextSize: style.textSize + 2,
					Size: udim2(0, 16, 0, 16),
						Text: "×",
						LayoutOrder: 3,
						Visible: opts.closable ?? false,
						ZIndex: 102,
							Activated: () => {
								if (!isTopGuiTarget(ref.close, undefined, undefined, inputService)) return;
								setClosed(true);
								opts.onClose?.();
					},
				}),
					InputBegan: (...args: ReadonlyArray<unknown>) => beginTitleDrag(args[0] as InputObject),
				InputEnded: (...args: ReadonlyArray<unknown>) => {
					finishTitleDrag(args[0] as InputObject);
				},
			}),
			3: create("ScrollingFrame", {
				[rawRef as never]: "container",
				BackgroundTransparency: 1,
				BorderSizePixel: 0,
				ScrollBarThickness: style.scrollbarSize,
				ScrollBarImageColor3: style.scrollbarGrabColor,
					VerticalScrollBarInset: Enum.ScrollBarInset.ScrollBar,
					HorizontalScrollBarInset: Enum.ScrollBarInset.ScrollBar,
					Active: true,
					ZIndex: 101,
					Position: udim2(0, 0, 0, titleBarHeight),
				Size: udim2(1, 0, 0, contentHeight),
				CanvasSize: udim2(0, 0, 0, 0),
				AutomaticCanvasSize: Enum.AutomaticSize.Y,
				0: create("UIListLayout", {
					SortOrder: Enum.SortOrder.LayoutOrder,
					Padding: udim(0, style.itemSpacing.Y),
				}),
				1: create("UIPadding", {
					PaddingLeft: udim(0, padX),
					PaddingRight: udim(0, padX),
					PaddingTop: udim(0, padY),
					PaddingBottom: udim(0, padY),
				}),
			}),
			4: create("TextButton", {
				[rawRef as never]: "resizeGrip",
				BackgroundTransparency: 1,
				Text: "⊿",
				Font: Enum.Font.Code,
				TextSize: 14,
				TextColor3: style.weakTextColor,
				AnchorPoint: v2(1, 1),
				Position: udim2(1, 0, 1, 0),
				Size: udim2(0, 16, 0, 16),
				Rotation: 0,
				ZIndex: 102,
					InputBegan: (...args: ReadonlyArray<unknown>) => beginResize(args[0] as InputObject),
				InputEnded: (...args: ReadonlyArray<unknown>) => {
					finishResize(args[0] as InputObject);
					},
			}),
		});

			markHitTestSurface(ref.frame);
			return [ref.frame, ref.container] as [Instance, Instance];
		}) as unknown as WindowRefs;

	__useEffect("window:effect", () => {
		return () => {
			if (refs.dragConnection !== undefined) {
				refs.dragConnection.Disconnect();
				refs.dragConnection = undefined;
			}
				if (refs.resizeConnection !== undefined) {
					refs.resizeConnection.Disconnect();
					refs.resizeConnection = undefined;
				}
				if (refs.inputBeganConnection !== undefined) {
					refs.inputBeganConnection.Disconnect();
					refs.inputBeganConnection = undefined;
				}
				if (refs.inputEndedConnection !== undefined) {
					refs.inputEndedConnection.Disconnect();
					refs.inputEndedConnection = undefined;
				}
				if (refs.pointerDragging === true) {
					refs.pointerDragging = false;
					refs.endPointerDrag?.();
				}
			};
		});

	const movable = opts.movable !== undefined ? opts.movable : true;
	const resizable = opts.resizable !== undefined ? opts.resizable : true;
	const minimizable = opts.minimizable ?? false;
	const visible = opts.visible !== undefined ? opts.visible : true;

	refs.frame.Visible = visible;
	refs.titleBar.Active = true;
	refs.frame.SetAttribute("movable", movable);
	refs.frame.SetAttribute(WINDOW_ATTRIBUTE, true);
	refs.minimize.Visible = minimizable;
	refs.close.Visible = opts.closable ?? false;

	refs.title.Text = opts.title ?? "";

		const style = useStyle();
		useHoverTarget(refs.minimize, (value) => {
			refs.minimize.TextColor3 = value ? style.strongTextColor : style.weakTextColor;
		}, `Window minimize: ${opts.title ?? ""}`);
		useHoverTarget(refs.close, (value) => {
			refs.close.TextColor3 = value ? style.strongTextColor : style.weakTextColor;
		}, `Window close: ${opts.title ?? ""}`);

		const titleBarHeight = style.titleBarHeight;
	if (minimized) {
		refs.frame.Size = udim2(0, size.X, 0, titleBarHeight);
		refs.container.Visible = false;
		refs.resizeGrip.Visible = false;
	} else {
		refs.frame.Size = udim2(0, size.X, 0, size.Y);
		refs.container.Size = udim2(1, 0, 0, size.Y - titleBarHeight);
		refs.container.Visible = true;
		refs.resizeGrip.Visible = resizable;
	}

	const scrollX = opts.scrollX ?? false;
	const scrollY = opts.scrollY !== undefined ? opts.scrollY : true;
	if (scrollX && scrollY) {
		refs.container.AutomaticCanvasSize = Enum.AutomaticSize.XY;
	} else if (scrollX) {
		refs.container.AutomaticCanvasSize = Enum.AutomaticSize.X;
	} else if (scrollY) {
		refs.container.AutomaticCanvasSize = Enum.AutomaticSize.Y;
	} else {
		refs.container.AutomaticCanvasSize = Enum.AutomaticSize.None;
	}

	provideContext(contexts.scrollX, scrollX);

	__scope("window:children", fn);

	return {
		closed() {
			if (closed) {
				setClosed(false);
				return true;
			}
			return false;
		},
		minimized() {
			if (minimized) {
				setMinimized(false);
				return true;
			}
			return false;
		},
	};
}, "@rovy/ui/window");
