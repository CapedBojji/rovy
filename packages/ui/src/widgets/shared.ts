import { udim, udim2 } from "../primitives";
import type { Style } from "../style";
import { create } from "../create";
import { getDefaultRovyInputService, type RovyInputService } from "../input";
import {
	HIT_TEST_PASS_THROUGH_ATTRIBUTE,
	HIT_TEST_SURFACE_ATTRIBUTE,
	INPUT_SINK_ATTRIBUTE,
} from "../windowConstants";

const DEFAULT_CURSOR_ICON = "rbxasset://SystemCursors/Arrow";
let defaultCursorHoldCount = 0;
let defaultCursorConnection: RBXScriptConnection | undefined;

export function textProps(text: string, style: Style): Record<string, unknown> {
	return {
		Text: text,
		TextColor3: style.textColor,
		TextSize: style.textSize,
		BackgroundTransparency: 1,
		Size: udim2(1, 0, 0, style.itemHeight),
	};
}

export function frameProps(style: Style): Record<string, unknown> {
	return {
		BackgroundColor3: style.frameBgColor,
		BackgroundTransparency: style.frameBgTransparency,
		BorderSizePixel: 0,
		Size: udim2(1, 0, 0, style.itemHeight),
	};
}

export function basicHandle(
	flag: boolean,
	clear: (value: boolean) => void,
	name: string,
): Record<string, () => boolean> {
	const handle = {
		clicked() {
			if (flag) {
				clear(false);
				return true;
			}
			return false;
		},
	};
	return handle as Record<string, () => boolean>;
}

function setDefaultCursor(inputService?: RovyInputService): void {
	const input = inputService ?? getDefaultRovyInputService();
	if (input !== undefined) input.MouseIcon = DEFAULT_CURSOR_ICON;

	const [playersOk, players] = pcall(() => game.GetService("Players"));
	if (!playersOk) return;
	const player = (players as Players).LocalPlayer;
	if (player === undefined) return;
	player.GetMouse().Icon = DEFAULT_CURSOR_ICON;
}

function ensureDefaultCursorLoop(): void {
	if (defaultCursorConnection !== undefined) return;
	const [runOk, runService] = pcall(() => game.GetService("RunService"));
	if (!runOk) return;
	defaultCursorConnection = (runService as RunService).RenderStepped.Connect(() => {
		if (defaultCursorHoldCount <= 0) {
			defaultCursorConnection?.Disconnect();
			defaultCursorConnection = undefined;
			defaultCursorHoldCount = 0;
			return;
		}
		setDefaultCursor();
	});
}

function stopDefaultCursorLoopIfIdle(): void {
	if (defaultCursorHoldCount > 0) return;
	defaultCursorConnection?.Disconnect();
	defaultCursorConnection = undefined;
	defaultCursorHoldCount = 0;
}

export function defaultCursorHandlers(inputService?: RovyInputService): {
	MouseEnter: () => void;
	MouseMoved: () => void;
	MouseLeave: () => void;
} {
	let hovering = false;
	const enter = (): void => {
		if (!hovering) {
			hovering = true;
			defaultCursorHoldCount += 1;
			ensureDefaultCursorLoop();
		}
		setDefaultCursor(inputService);
	};
	const leave = (): void => {
		if (!hovering) return;
		hovering = false;
		defaultCursorHoldCount = math.max(0, defaultCursorHoldCount - 1);
		stopDefaultCursorLoopIfIdle();
	};
	return {
		MouseEnter: enter,
		MouseMoved: () => {
			if (hovering) setDefaultCursor(inputService);
		},
		MouseLeave: leave,
	};
}

export function bindDefaultCursor(guiObject: GuiObject, inputService?: RovyInputService): () => void {
	const handlers = defaultCursorHandlers(inputService);
	const enterConnection = guiObject.MouseEnter.Connect(handlers.MouseEnter);
	const moveConnection = guiObject.MouseMoved.Connect(handlers.MouseMoved);
	const leaveConnection = guiObject.MouseLeave.Connect(handlers.MouseLeave);
	return () => {
		handlers.MouseLeave();
		enterConnection.Disconnect();
		moveConnection.Disconnect();
		leaveConnection.Disconnect();
	};
}

function parentOf(instance: Instance): Instance | undefined {
	return (instance as unknown as { Parent?: Instance }).Parent;
}

function containsGuiObject(root: Instance, candidate: Instance): boolean {
	let current: Instance | undefined = candidate;
	while (current !== undefined) {
		if (current === root) return true;
		current = parentOf(current);
	}
	return false;
}

function setBoolAttribute(instance: Instance, name: string): void {
	pcall(() => instance.SetAttribute(name, true));
}

export function markHitTestSurface(guiObject: Instance): void {
	setBoolAttribute(guiObject, HIT_TEST_SURFACE_ATTRIBUTE);
}

export function markHitTestPassThrough(guiObject: Instance): void {
	setBoolAttribute(guiObject, HIT_TEST_PASS_THROUGH_ATTRIBUTE);
}

export function markInputSink(guiObject: Instance): void {
	setBoolAttribute(guiObject, INPUT_SINK_ATTRIBUTE);
}

function isHitTestPassThrough(guiObject: Instance): boolean {
	const [ok, value] = pcall(() => guiObject.GetAttribute(HIT_TEST_PASS_THROUGH_ATTRIBUTE));
	return ok && value === true;
}

function isPassThroughForTarget(blocker: Instance, target: Instance): boolean {
	if (!isHitTestPassThrough(blocker)) return false;
	if (containsGuiObject(blocker, target)) return true;

	let current = parentOf(blocker);
	while (current !== undefined) {
		if (isHitTestPassThrough(current) && containsGuiObject(current, target)) return true;
		current = parentOf(current);
	}
	return false;
}

function findScreenGui(guiObject: Instance): ScreenGui | undefined {
	let current: Instance | undefined = guiObject;
	while (current !== undefined) {
		if (current.IsA("ScreenGui")) return current as ScreenGui;
		current = parentOf(current);
	}
	return undefined;
}

function inputPosition(inputOrX?: unknown, y?: unknown, inputService?: RovyInputService): Vector2 | undefined {
	if (typeIs(inputOrX, "number") && typeIs(y, "number")) {
		return new Vector2(inputOrX, y);
	}

	if (inputOrX !== undefined && !typeIs(inputOrX, "number")) {
		const position = (inputOrX as { Position?: Vector3 }).Position;
		if (position !== undefined) return new Vector2(position.X, position.Y);
	}
	const input = inputService ?? getDefaultRovyInputService();
	if (input === undefined) return undefined;
	const [mouseOk, location] = pcall(() => input.GetMouseLocation());
	if (!mouseOk) return undefined;

	const [serviceOk, service] = pcall(() => game.GetService("GuiService"));
	if (!serviceOk) return location;
	const [insetOk, topLeft] = pcall(() => {
		const [topLeftInset] = (service as GuiService).GetGuiInset();
		return topLeftInset;
	});
	if (!insetOk) return location;
	const guiInset = topLeft as Vector2;
	return new Vector2(location.X - guiInset.X, location.Y - guiInset.Y);
}

function rawInputPosition(inputOrX?: unknown, y?: unknown): Vector2 | undefined {
	if (typeIs(inputOrX, "number") && typeIs(y, "number")) {
		return new Vector2(inputOrX, y);
	}

	if (inputOrX !== undefined && !typeIs(inputOrX, "number")) {
		const vector = inputOrX as { X?: number; Y?: number; Position?: { X: number; Y: number } };
		if (vector.Position !== undefined) return new Vector2(vector.Position.X, vector.Position.Y);
		if (typeIs(vector.X, "number") && typeIs(vector.Y, "number")) return new Vector2(vector.X, vector.Y);
	}

	return undefined;
}

export function pointInsideGuiObject(guiObject: GuiObject | undefined, inputOrX?: unknown, y?: unknown): boolean {
	if (guiObject === undefined || !guiObject.Visible) return false;
	const position = rawInputPosition(inputOrX, y);
	if (position === undefined) return false;
	const absolutePosition = guiObject.AbsolutePosition;
	const absoluteSize = guiObject.AbsoluteSize;
	return (
		position.X >= absolutePosition.X &&
		position.X <= absolutePosition.X + absoluteSize.X &&
		position.Y >= absolutePosition.Y &&
		position.Y <= absolutePosition.Y + absoluteSize.Y
	);
}

function guiObjectsAt(guiObject: Instance, position: Vector2): ReadonlyArray<GuiObject> | undefined {
	const screenGui = findScreenGui(guiObject);
	const root = parentOf(screenGui ?? guiObject);
	if (root === undefined || !root.IsA("PlayerGui")) return undefined;
	const [ok, objects] = pcall(() => (root as PlayerGui).GetGuiObjectsAtPosition(position.X, position.Y));
	return ok ? (objects as ReadonlyArray<GuiObject>) : undefined;
}

export function isTopGuiTarget(
	guiObject: Instance,
	inputOrX?: unknown,
	y?: unknown,
	inputService?: RovyInputService,
): boolean {
	const position = inputPosition(inputOrX, y, inputService);
	if (position === undefined) return true;
	const objects = guiObjectsAt(guiObject, position);
	if (objects === undefined) return true;

	for (const object of objects) {
		if (!object.Visible) continue;
		if (object === guiObject || containsGuiObject(guiObject, object)) return true;
		if (isPassThroughForTarget(object, guiObject)) continue;
		return false;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Widget visual helpers
// ---------------------------------------------------------------------------

export type InteractState = "inactive" | "hovered" | "active" | "disabled";

export interface WidgetBg {
	color: Color3;
	transparency: number;
}

export function widgetBgFor(state: InteractState, style: Style): WidgetBg {
	if (state === "disabled") return { color: style.widgetInactiveBgColor, transparency: 0.5 };
	if (state === "active") return { color: style.widgetActiveBgColor, transparency: 0 };
	if (state === "hovered") return { color: style.widgetHoveredBgColor, transparency: 0 };
	return { color: style.widgetInactiveBgColor, transparency: 0 };
}

export function applyWidgetBg(frame: GuiObject, state: InteractState, style: Style): void {
	const bg = widgetBgFor(state, style);
	frame.BackgroundColor3 = bg.color;
	frame.BackgroundTransparency = bg.transparency;
}

export interface StrokeStyle {
	color: Color3;
	transparency: number;
	thickness: number;
}

export function strokeFor(state: InteractState, style: Style): StrokeStyle {
	if (state === "disabled")
		return {
			color: style.strokeInactiveColor,
			transparency: 0.5,
			thickness: style.strokeThickness,
		};
	if (state === "active")
		return {
			color: style.strokeActiveColor,
			transparency: style.strokeActiveTransparency,
			thickness: style.strokeThickness,
		};
	if (state === "hovered")
		return {
			color: style.strokeHoveredColor,
			transparency: style.strokeHoveredTransparency,
			thickness: style.strokeThickness,
		};
	return {
		color: style.strokeInactiveColor,
		transparency: style.strokeInactiveTransparency,
		thickness: style.strokeThickness,
	};
}

export function applyStrokeState(stroke: UIStroke, state: InteractState, style: Style): void {
	const s = strokeFor(state, style);
	stroke.Color = s.color;
	stroke.Transparency = s.transparency;
	stroke.Thickness = s.thickness;
}

export function makeCorner(radius: number): UICorner {
	return create("UICorner", { CornerRadius: udim(0, math.max(0, radius)) });
}

export interface PerCornerRadii {
	tl?: number;
	tr?: number;
	bl?: number;
	br?: number;
}

export function makeCornerPerSide(r: PerCornerRadii): UICorner {
	const max = math.max(r.tl ?? 0, r.tr ?? 0, r.bl ?? 0, r.br ?? 0);
	const corner = create("UICorner", { CornerRadius: udim(0, max) });
	const props = corner as unknown as Record<string, UDim>;
	props.TopLeftRadius = udim(0, r.tl ?? 0);
	props.TopRightRadius = udim(0, r.tr ?? 0);
	props.BottomLeftRadius = udim(0, r.bl ?? 0);
	props.BottomRightRadius = udim(0, r.br ?? 0);
	return corner;
}

export function makeStroke(style: Style, state: InteractState = "inactive"): UIStroke {
	const s = strokeFor(state, style);
	return create("UIStroke", {
		Color: s.color,
		Transparency: s.transparency,
		Thickness: s.thickness,
		ApplyStrokeMode: Enum.ApplyStrokeMode.Border,
	});
}

export function makeShadow(style: Style): UIShadow | undefined {
	if (!style.shadowEnabled) return undefined;
	const [ok, shadow] = pcall(() =>
		create("UIShadow", {
			Color: style.shadowColor,
			BlurRadius: udim(0, style.shadowBlurRadius),
			Offset: udim2(0, style.shadowOffset.X, 0, style.shadowOffset.Y),
			Transparency: style.shadowTransparency,
			Spread: udim2(0, 0, 0, 0),
			ZIndex: -1,
		}),
	);
	return ok ? shadow : undefined;
}
