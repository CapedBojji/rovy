import {
	widget,
	__callWidget,
	__scope,
	__useEffect,
	__useInstance,
	__useState,
	provideContext,
	useContext,
	useInputService,
	usePointerDrag,
} from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { createConnect } from "../createConnect";
import { c, udim, udim2 } from "../primitives";
import * as contexts from "../contexts";
import { isTopGuiTarget, markInputSink, pointInsideGuiObject } from "./shared";

export interface ViewportCameraOptions {
	cframe: CFrame;
	fieldOfView?: number;
}

export interface ViewportFreeCameraOptions {
	enabled?: boolean;
	speed?: number;
	sprintMultiplier?: number;
	lookSensitivity?: number;
}

export interface ViewportFrameOptions {
	width?: number;
	height?: number;
	backgroundColor?: Color3;
	backgroundTransparency?: number;
	border?: boolean;
	camera?: ViewportCameraOptions;
	captureInput?: boolean;
	freeCamera?: boolean | ViewportFreeCameraOptions;
	onCaptureChanged?: (captured: boolean) => void;
	onDrag?: (delta: Vector2, totalDelta: Vector2, input: InputObject) => void;
}

export interface ViewportItemOptions {
	source: Instance;
	pivot?: CFrame;
	scale?: number;
	visible?: boolean;
}

export interface ViewportFrameHandle {
	instance(): ViewportFrame | undefined;
	worldModel(): WorldModel | undefined;
	camera(): Camera | undefined;
	itemCount(): number;
	captured(): boolean;
	captureInput(): void;
	releaseInput(): void;
}

export interface ViewportItemHandle {
	clone(): Instance | undefined;
}

interface ViewportRegistration {
	id: string;
	options: ViewportItemOptions;
}

interface StoredViewportItem {
	id: string;
	source: Instance;
	clone?: Instance;
	pivot?: CFrame;
	scale?: number;
	visible: boolean;
	warnedScaleUnsupported?: boolean;
}

interface ViewportFrameStore {
	items: Map<string, StoredViewportItem>;
	order: string[];
	warnedMissingCamera?: boolean;
}

interface ViewportFrameRefs {
	root: Frame;
	viewport: ViewportFrame;
	inputCapture: TextButton;
	worldModel: WorldModel;
	camera: Camera;
	store?: ViewportFrameStore;
	captureInput?: boolean;
	freeCamera?: boolean;
	freeCameraSpeed?: number;
	freeCameraSprintMultiplier?: number;
	freeCameraLookSensitivity?: number;
	freeCameraPosition?: Vector3;
	freeCameraYaw?: number;
	freeCameraPitch?: number;
	freeCameraLastStepClock?: number;
	onCaptureChanged?: (captured: boolean) => void;
	onDrag?: (delta: Vector2, totalDelta: Vector2, input: InputObject) => void;
	captured?: boolean;
	captureReleaseOnMouseUp?: boolean;
	dragStart?: Vector2;
	lastDrag?: Vector2;
	dragTotal?: Vector2;
	inputChangedConnection?: RBXScriptConnection;
	inputBeganConnection?: RBXScriptConnection;
	inputEndedConnection?: RBXScriptConnection;
	pointerDragging?: boolean;
	freeCameraLookDragging?: boolean;
	freeCameraPreviousMouseBehavior?: Enum.MouseBehavior;
	endCapture?: () => void;
	startCapture?: () => void;
	freeCameraControlActionName?: string;
	freeCameraControlsBound?: boolean;
	lastMouseCaptureToggleClock?: number;
	lastMouseCaptureTogglePosition?: Vector2;
}

interface ViewportFrameScope {
	register(registration: ViewportRegistration): ViewportItemHandle;
}

let nextViewportItemId = 0;
let nextViewportFrameId = 0;

const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 160;
const DEFAULT_FIELD_OF_VIEW = 35;
const DEFAULT_FREE_CAMERA_SPEED = 12;
const DEFAULT_FREE_CAMERA_SPRINT_MULTIPLIER = 3;
const DEFAULT_FREE_CAMERA_LOOK_SENSITIVITY = 0.25;
const FREE_CAMERA_ACTION_PRIORITY = 10000;
const contextActionService = game.GetService("ContextActionService");
const players = game.GetService("Players");
const FREE_CAMERA_CONTROL_INPUTS = [
	Enum.KeyCode.W,
	Enum.KeyCode.A,
	Enum.KeyCode.S,
	Enum.KeyCode.D,
	Enum.KeyCode.Q,
	Enum.KeyCode.E,
	Enum.KeyCode.Space,
	Enum.KeyCode.LeftShift,
	Enum.KeyCode.RightShift,
	Enum.KeyCode.LeftControl,
	Enum.KeyCode.RightControl,
	Enum.KeyCode.Escape,
	Enum.PlayerActions.CharacterForward,
	Enum.PlayerActions.CharacterBackward,
	Enum.PlayerActions.CharacterLeft,
	Enum.PlayerActions.CharacterRight,
	Enum.PlayerActions.CharacterJump,
];

interface RobloxPlayerControls {
	Disable?: (self: RobloxPlayerControls) => void;
	Enable?: (self: RobloxPlayerControls) => void;
}

interface RobloxPlayerModule {
	GetControls?: (self: RobloxPlayerModule) => RobloxPlayerControls;
}

let activeFreeCameraControlCaptures = 0;
let disabledPlayerControls: RobloxPlayerControls | undefined;

function createViewportStore(): ViewportFrameStore {
	return { items: new Map<string, StoredViewportItem>(), order: new Array<string>() };
}

function sameCFrame(left: CFrame | undefined, right: CFrame | undefined): boolean {
	return left === right;
}

function cloneSource(source: Instance): Instance | undefined {
	const [ok, value] = pcall(() => source.Clone());
	if (!ok) {
		warn(`[rovy-ui] viewportItem source clone failed: ${tostring(value)}`);
		return undefined;
	}
	return value as Instance;
}

function destroyClone(item: StoredViewportItem): void {
	item.clone?.Destroy();
	item.clone = undefined;
}

function applyPivot(instance: Instance, pivot: CFrame | undefined): void {
	if (pivot === undefined) return;
	const dynamic = instance as unknown as {
		PivotTo?: (self: unknown, pivot: CFrame) => void;
		CFrame?: CFrame;
	};
	if (typeIs(dynamic.PivotTo, "function")) {
		const [ok, err] = pcall(() => dynamic.PivotTo!(dynamic, pivot));
		if (!ok) warn(`[rovy-ui] viewportItem pivot failed: ${tostring(err)}`);
		return;
	}
	if (instance.IsA("BasePart")) {
		dynamic.CFrame = pivot;
	}
}

function applyScale(item: StoredViewportItem): void {
	const scale = item.scale;
	const clone = item.clone;
	if (scale === undefined || clone === undefined) return;
	const dynamic = clone as unknown as {
		ScaleTo?: (self: unknown, scale: number) => void;
		Size?: Vector3;
	};
	if (typeIs(dynamic.ScaleTo, "function")) {
		const [ok, err] = pcall(() => dynamic.ScaleTo!(dynamic, scale));
		if (!ok) warn(`[rovy-ui] viewportItem scale failed: ${tostring(err)}`);
		return;
	}
	if (clone.IsA("BasePart") && dynamic.Size !== undefined) {
		dynamic.Size = scaleVector3(dynamic.Size, scale);
		return;
	}
	if (item.warnedScaleUnsupported !== true) {
		item.warnedScaleUnsupported = true;
		warn("[rovy-ui] viewportItem scale is only supported for models with ScaleTo or BasePart Size");
	}
}

function ensureClone(item: StoredViewportItem, worldModel: WorldModel): void {
	if (!item.visible) {
		destroyClone(item);
		return;
	}
	if (item.clone === undefined) {
		item.clone = cloneSource(item.source);
		if (item.clone !== undefined) item.clone.Parent = worldModel;
	}
	if (item.clone === undefined) return;
	applyPivot(item.clone, item.pivot);
	applyScale(item);
}

function reconcileViewportItems(
	store: ViewportFrameStore,
	worldModel: WorldModel,
	registrations: ViewportRegistration[],
): void {
	const active = new Set<string>();
	const nextOrder = new Array<string>();
	for (const registration of registrations) {
		const id = registration.id;
		const options = registration.options;
		active.add(id);
		nextOrder.push(id);

		const visible = options.visible !== false;
		let item = store.items.get(id);
		const sourceChanged = item !== undefined && item.source !== options.source;
		const scaleChanged = item !== undefined && item.scale !== options.scale;
		if (item === undefined) {
			item = {
				id,
				source: options.source,
				pivot: options.pivot,
				scale: options.scale,
				visible,
			};
			store.items.set(id, item);
		} else if (sourceChanged || scaleChanged) {
			destroyClone(item);
			if (sourceChanged) item.source = options.source;
			item.warnedScaleUnsupported = false;
		}

		const changed =
			item.visible !== visible ||
			!sameCFrame(item.pivot, options.pivot) ||
			scaleChanged ||
			sourceChanged;
		item.visible = visible;
		item.pivot = options.pivot;
		item.scale = options.scale;
		if (changed || item.clone === undefined) ensureClone(item, worldModel);
	}

	for (const [id, item] of store.items) {
		if (active.has(id)) continue;
		destroyClone(item);
		store.items.delete(id);
	}
	store.order = nextOrder;
}

function vector3(x: number, y: number, z: number): Vector3 {
	const [ok, value] = pcall(() => new Vector3(x, y, z));
	if (ok) return value;
	return ({ X: x, Y: y, Z: z, Magnitude: math.sqrt(x * x + y * y + z * z) } as unknown) as Vector3;
}

function addVector3(left: Vector3, right: Vector3): Vector3 {
	return vector3(left.X + right.X, left.Y + right.Y, left.Z + right.Z);
}

function scaleVector3(value: Vector3, scale: number): Vector3 {
	return vector3(value.X * scale, value.Y * scale, value.Z * scale);
}

function unitVector3(value: Vector3): Vector3 {
	const magnitude = value.Magnitude;
	if (magnitude <= 0.0001) return vector3(0, 0, 0);
	return scaleVector3(value, 1 / magnitude);
}

function localPlayerControls(): RobloxPlayerControls | undefined {
	const localPlayer = players.LocalPlayer;
	if (localPlayer === undefined) return undefined;
	const [scriptsOk, playerScripts] = pcall(() => localPlayer.FindFirstChild("PlayerScripts"));
	if (!scriptsOk || playerScripts === undefined) return undefined;
	const playerModuleScript = playerScripts.FindFirstChild("PlayerModule");
	if (playerModuleScript === undefined || !playerModuleScript.IsA("ModuleScript")) return undefined;
	const [moduleOk, moduleValue] = pcall(() => require(playerModuleScript) as RobloxPlayerModule);
	if (!moduleOk || !typeIs(moduleValue.GetControls, "function")) return undefined;
	const [controlsOk, controls] = pcall(() => moduleValue.GetControls!(moduleValue));
	return controlsOk ? controls : undefined;
}

function zeroLocalHumanoidMove(): void {
	const character = players.LocalPlayer?.Character;
	if (character === undefined) return;
	const humanoid = character.FindFirstChildOfClass("Humanoid");
	if (humanoid === undefined) return;
	pcall(() => humanoid.Move(vector3(0, 0, 0), false));
}

function disableLocalPlayerControlsForFreeCamera(): void {
	activeFreeCameraControlCaptures += 1;
	if (activeFreeCameraControlCaptures > 1) return;
	const controls = localPlayerControls();
	if (controls?.Disable === undefined) return;
	const [ok] = pcall(() => controls.Disable!(controls));
	if (ok) disabledPlayerControls = controls;
	zeroLocalHumanoidMove();
}

function restoreLocalPlayerControlsForFreeCamera(): void {
	if (activeFreeCameraControlCaptures > 0) activeFreeCameraControlCaptures -= 1;
	if (activeFreeCameraControlCaptures > 0) return;
	zeroLocalHumanoidMove();
	const controls = disabledPlayerControls;
	disabledPlayerControls = undefined;
	if (controls?.Enable !== undefined) pcall(() => controls.Enable!(controls));
}

function cframeAt(position: Vector3, focus?: Vector3): CFrame {
	if (focus !== undefined) {
		const [lookOk, lookValue] = pcall(() => CFrame.lookAt(position, focus));
		if (lookOk) return lookValue;
		const [atOk, atValue] = pcall(() => new CFrame(position, focus));
		if (atOk) return atValue;
	}
	const [ok, value] = pcall(() => new CFrame(position));
	if (ok) return value;
	return ({ Position: position } as unknown) as CFrame;
}

interface ViewportBounds {
	cframe: CFrame;
	size: Vector3;
}

function boundsFor(instance: Instance): ViewportBounds | undefined {
	const dynamic = instance as unknown as {
		GetBoundingBox?: (self: unknown) => LuaTuple<[CFrame, Vector3]>;
		CFrame?: CFrame;
		Position?: Vector3;
		Size?: Vector3;
	};
	if (typeIs(dynamic.GetBoundingBox, "function")) {
		const [ok, boxCFrame, size] = pcall(() => dynamic.GetBoundingBox!(dynamic));
		if (ok) return { cframe: boxCFrame as CFrame, size: size as Vector3 };
	}
	if (instance.IsA("BasePart") && dynamic.Size !== undefined) {
		return { cframe: dynamic.CFrame ?? cframeAt(dynamic.Position ?? vector3(0, 0, 0)), size: dynamic.Size };
	}
	return undefined;
}

function applyAutoCamera(refs: ViewportFrameRefs): void {
	const store = refs.store;
	if (store === undefined || store.order.size() === 0) return;

	let center = vector3(0, 0, 0);
	let radius = 0;
	let count = 0;
	for (const id of store.order) {
		const item = store.items.get(id);
		if (item?.clone === undefined) continue;
		const bounds = boundsFor(item.clone);
		if (bounds === undefined) continue;
		const position = bounds.cframe.Position ?? vector3(0, 0, 0);
		center = vector3(center.X + position.X, center.Y + position.Y, center.Z + position.Z);
		radius = math.max(radius, bounds.size.Magnitude / 2);
		count += 1;
	}
	if (count <= 0) return;

	center = vector3(center.X / count, center.Y / count, center.Z / count);
	const distance = math.max(6, radius * 2.4);
	const position = vector3(center.X, center.Y + distance * 0.35, center.Z + distance);
	refs.camera.CFrame = cframeAt(position, center);
	refs.camera.FieldOfView = DEFAULT_FIELD_OF_VIEW;
}

function applyCamera(refs: ViewportFrameRefs, options: ViewportFrameOptions): void {
	if (refs.freeCamera === true) {
		const fallback = options.camera?.cframe ?? refs.camera.CFrame ?? cframeAt(vector3(0, 2, 8), vector3(0, 0, 0));
		if (refs.captured !== true && options.camera !== undefined) syncFreeCameraToCFrame(refs, fallback);
		else if (refs.freeCameraPosition === undefined) syncFreeCameraToCFrame(refs, fallback);
		if (options.camera !== undefined) refs.camera.FieldOfView = options.camera.fieldOfView ?? DEFAULT_FIELD_OF_VIEW;
		stepFreeCamera(refs);
		refs.camera.CFrame = freeCameraCFrame(refs);
		return;
	}

	if (options.camera !== undefined) {
		refs.camera.CFrame = options.camera.cframe;
		refs.camera.FieldOfView = options.camera.fieldOfView ?? DEFAULT_FIELD_OF_VIEW;
		return;
	}

	const store = refs.store;
	if (store !== undefined && store.order.size() > 0 && store.warnedMissingCamera !== true) {
		store.warnedMissingCamera = true;
		warn("[rovy-ui] viewportFrame rendered items without camera; using auto-framed fallback camera");
	}
	applyAutoCamera(refs);
}

function inputPosition(input: InputObject): Vector2 {
	return new Vector2(input.Position.X, input.Position.Y);
}

function inputDelta(input: InputObject): Vector2 | undefined {
	const delta = (input as unknown as { Delta?: { X: number; Y: number } }).Delta;
	if (delta === undefined) return undefined;
	return new Vector2(delta.X, delta.Y);
}

function freeCameraConfig(value: boolean | ViewportFreeCameraOptions | undefined): ViewportFreeCameraOptions | undefined {
	if (value === true) return {};
	if (typeIs(value, "table")) return value;
	return undefined;
}

function syncFreeCameraToCFrame(refs: ViewportFrameRefs, cframe: CFrame): void {
	refs.freeCameraPosition = cframe.Position ?? vector3(0, 2, 8);
	const look = cframe.LookVector ?? vector3(0, 0, -1);
	refs.freeCameraYaw = math.atan2(look.X, -look.Z);
	refs.freeCameraPitch = math.asin(math.clamp(look.Y, -1, 1));
	refs.freeCameraLastStepClock = undefined;
}

function keyDown(inputService: ReturnType<typeof useInputService>, key: Enum.KeyCode): boolean {
	if (inputService?.IsKeyDown === undefined) return false;
	const [ok, down] = pcall(() => inputService.IsKeyDown!(key));
	return ok && down === true;
}

function modifierKeysDown(inputService: ReturnType<typeof useInputService>): boolean {
	const ctrl = keyDown(inputService, Enum.KeyCode.LeftControl) || keyDown(inputService, Enum.KeyCode.RightControl);
	const shift = keyDown(inputService, Enum.KeyCode.LeftShift) || keyDown(inputService, Enum.KeyCode.RightShift);
	return ctrl && shift;
}

function freeCameraLook(yaw: number, pitch: number): Vector3 {
	const cosPitch = math.cos(pitch);
	return unitVector3(vector3(math.sin(yaw) * cosPitch, math.sin(pitch), -math.cos(yaw) * cosPitch));
}

function freeCameraHorizontalForward(yaw: number): Vector3 {
	return unitVector3(vector3(math.sin(yaw), 0, -math.cos(yaw)));
}

function freeCameraRight(yaw: number): Vector3 {
	return unitVector3(vector3(math.cos(yaw), 0, math.sin(yaw)));
}

function freeCameraCFrame(refs: ViewportFrameRefs): CFrame {
	const position = refs.freeCameraPosition ?? vector3(0, 2, 8);
	const look = freeCameraLook(refs.freeCameraYaw ?? 0, refs.freeCameraPitch ?? 0);
	return cframeAt(position, addVector3(position, look));
}

function stepFreeCamera(refs: ViewportFrameRefs): void {
	const inputService = useInputService();
	const now = os.clock();
	const previous = refs.freeCameraLastStepClock;
	refs.freeCameraLastStepClock = now;
	if (refs.captured !== true || inputService === undefined) return;

	const dt = previous === undefined ? 1 / 60 : math.clamp(now - previous, 1 / 240, 1 / 15);
	const yaw = refs.freeCameraYaw ?? 0;
	let move = vector3(0, 0, 0);
	if (keyDown(inputService, Enum.KeyCode.W)) move = addVector3(move, freeCameraHorizontalForward(yaw));
	if (keyDown(inputService, Enum.KeyCode.S)) move = addVector3(move, scaleVector3(freeCameraHorizontalForward(yaw), -1));
	if (keyDown(inputService, Enum.KeyCode.D)) move = addVector3(move, freeCameraRight(yaw));
	if (keyDown(inputService, Enum.KeyCode.A)) move = addVector3(move, scaleVector3(freeCameraRight(yaw), -1));
	if (keyDown(inputService, Enum.KeyCode.E) || keyDown(inputService, Enum.KeyCode.Space)) move = addVector3(move, vector3(0, 1, 0));
	if (keyDown(inputService, Enum.KeyCode.Q)) move = addVector3(move, vector3(0, -1, 0));
	if (move.Magnitude <= 0.0001) return;

	const sprinting = keyDown(inputService, Enum.KeyCode.LeftShift) || keyDown(inputService, Enum.KeyCode.RightShift);
	const speed = (refs.freeCameraSpeed ?? DEFAULT_FREE_CAMERA_SPEED) * (sprinting ? refs.freeCameraSprintMultiplier ?? DEFAULT_FREE_CAMERA_SPRINT_MULTIPLIER : 1);
	refs.freeCameraPosition = addVector3(refs.freeCameraPosition ?? vector3(0, 2, 8), scaleVector3(unitVector3(move), speed * dt));
}

function handleFreeCameraControl(refs: ViewportFrameRefs, state: Enum.UserInputState, input: InputObject): Enum.ContextActionResult {
	if (state === Enum.UserInputState.Begin && input.KeyCode === Enum.KeyCode.Escape) refs.endCapture?.();
	return Enum.ContextActionResult.Sink;
}

function bindFreeCameraControls(refs: ViewportFrameRefs): void {
	if (refs.freeCameraControlsBound === true) return;
	if (refs.freeCameraControlActionName === undefined) {
		nextViewportFrameId += 1;
		refs.freeCameraControlActionName = `@rovy/ui/viewportFrame/freeCameraControls:${nextViewportFrameId}`;
	}
	contextActionService.BindActionAtPriority(
		refs.freeCameraControlActionName,
		(_actionName, state, input) => handleFreeCameraControl(refs, state, input),
		false,
		FREE_CAMERA_ACTION_PRIORITY,
		...FREE_CAMERA_CONTROL_INPUTS,
	);
	disableLocalPlayerControlsForFreeCamera();
	refs.freeCameraControlsBound = true;
}

function unbindFreeCameraControls(refs: ViewportFrameRefs): void {
	if (refs.freeCameraControlsBound !== true) return;
	const actionName = refs.freeCameraControlActionName;
	if (actionName !== undefined) contextActionService.UnbindAction(actionName);
	restoreLocalPlayerControlsForFreeCamera();
	refs.freeCameraControlsBound = false;
}

function lockFreeCameraMouse(refs: ViewportFrameRefs, inputService: ReturnType<typeof useInputService>): void {
	if (inputService === undefined) return;
	if (inputService.MouseBehavior === undefined) return;
	if (refs.freeCameraPreviousMouseBehavior === undefined) refs.freeCameraPreviousMouseBehavior = inputService.MouseBehavior;
	inputService.MouseBehavior = Enum.MouseBehavior.LockCurrentPosition;
}

function restoreFreeCameraMouse(refs: ViewportFrameRefs, inputService: ReturnType<typeof useInputService>): void {
	const previousMouseBehavior = refs.freeCameraPreviousMouseBehavior;
	if (previousMouseBehavior === undefined || inputService === undefined) return;
	if (inputService.MouseBehavior !== undefined) inputService.MouseBehavior = previousMouseBehavior;
	refs.freeCameraPreviousMouseBehavior = undefined;
}

/** @widget */
const viewportFrameWidget = widget((options: ViewportFrameOptions = {}, children?: () => void): ViewportFrameHandle => {
	const [store] = __useState("viewportFrame:store", createViewportStore);
	const style = useStyle();
	const inputService = useInputService();
	const pointerDrag = usePointerDrag();

	const refs = __useInstance("viewportFrame:instance", (rawRef) => {
		const ref = rawRef as unknown as ViewportFrameRefs;
		const connectEvent = createConnect();
		const camera = create("Camera", {
			[rawRef as never]: "camera",
			FieldOfView: DEFAULT_FIELD_OF_VIEW,
		});
		const worldModel = create("WorldModel", {
			[rawRef as never]: "worldModel",
		});
		const viewport = create("ViewportFrame", {
			[rawRef as never]: "viewport",
			BackgroundColor3: options.backgroundColor ?? style.frameBgColor,
			BackgroundTransparency: options.backgroundTransparency ?? 0,
			BorderSizePixel: options.border === true ? 1 : 0,
			BorderColor3: style.borderColor ?? c(70, 70, 70),
			Size: udim2(1, 0, 1, 0),
			CurrentCamera: camera,
			0: worldModel,
		});
		const inputCapture = create("TextButton", {
			[rawRef as never]: "inputCapture",
			Name: "ViewportFrameInput",
			Active: true,
			AutoButtonColor: false,
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
			Text: "",
			Size: udim2(1, 0, 1, 0),
			ZIndex: 2,
		});
		inputCapture.InputSink = Enum.InputSink.All;
		markInputSink(inputCapture);
		const root = create("Frame", {
			[rawRef as never]: "root",
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
			Size: udim2(0, options.width ?? DEFAULT_WIDTH, 0, options.height ?? DEFAULT_HEIGHT),
			ClipsDescendants: true,
			0: create("UICorner", { CornerRadius: udim(0, style.cornerRadius) }),
			1: viewport,
			2: inputCapture,
		});
		camera.Parent = viewport;
		ref.store = store;
		ref.captured = false;
		ref.pointerDragging = false;
		ref.inputChangedConnection = undefined;
		ref.inputEndedConnection = undefined;

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

		const finishCapture = (): void => {
			if (ref.captured !== true) return;
			ref.captured = false;
			unbindFreeCameraControls(ref);
			ref.captureReleaseOnMouseUp = undefined;
			ref.freeCameraLookDragging = undefined;
			restoreFreeCameraMouse(ref, inputService);
			ref.dragStart = undefined;
			ref.lastDrag = undefined;
			ref.dragTotal = undefined;
			if (ref.inputChangedConnection !== undefined) {
				ref.inputChangedConnection.Disconnect();
				ref.inputChangedConnection = undefined;
			}
			if (ref.inputEndedConnection !== undefined) {
				ref.inputEndedConnection.Disconnect();
				ref.inputEndedConnection = undefined;
			}
			endPointerDrag();
			ref.onCaptureChanged?.(false);
		};

		const updateCapture = (input: InputObject): void => {
			if (ref.captured !== true) return;
			if (input.UserInputType !== Enum.UserInputType.MouseMovement) return;
			if (ref.freeCamera === true && ref.freeCameraLookDragging !== true) return;
			const current = inputPosition(input);
			const previous = ref.lastDrag ?? current;
			const start = ref.dragStart ?? current;
			ref.lastDrag = current;
			let delta = current.sub(previous);
			let total = current.sub(start);
			if (ref.freeCamera === true) {
				delta = inputDelta(input) ?? delta;
				total = (ref.dragTotal ?? new Vector2(0, 0)).add(delta);
				ref.dragTotal = total;
				const sensitivity = math.rad(ref.freeCameraLookSensitivity ?? DEFAULT_FREE_CAMERA_LOOK_SENSITIVITY);
				ref.freeCameraYaw = (ref.freeCameraYaw ?? 0) - delta.X * sensitivity;
				ref.freeCameraPitch = math.clamp((ref.freeCameraPitch ?? 0) - delta.Y * sensitivity, math.rad(-85), math.rad(85));
			}
			ref.onDrag?.(delta, total, input);
		};

		const beginCapture = (input: InputObject, requirePointInside = false, releaseOnMouseUp = true): void => {
			if (input.UserInputType !== Enum.UserInputType.MouseButton1) return;
			if (ref.captureInput !== true) return;
			if (ref.captured === true) return;
			if (requirePointInside && !pointInsideGuiObject(ref.inputCapture, input)) return;
			if (!isTopGuiTarget(ref.inputCapture, input, undefined, inputService)) return;

			const start = inputPosition(input);
			ref.captured = true;
			ref.captureReleaseOnMouseUp = releaseOnMouseUp;
			ref.dragStart = ref.freeCamera === true ? undefined : start;
			ref.lastDrag = ref.freeCamera === true ? undefined : start;
			if (ref.freeCamera === true) bindFreeCameraControls(ref);
			if (ref.freeCamera !== true) beginPointerDrag();
			ref.onCaptureChanged?.(true);

			if (inputService !== undefined) {
				if (ref.inputChangedConnection !== undefined) ref.inputChangedConnection.Disconnect();
				if (ref.inputEndedConnection !== undefined) ref.inputEndedConnection.Disconnect();
				ref.inputChangedConnection = connectEvent(inputService, "InputChanged", (...args: ReadonlyArray<unknown>) => {
					updateCapture(args[0] as InputObject);
				});
				ref.inputEndedConnection = connectEvent(inputService, "InputEnded", (...args: ReadonlyArray<unknown>) => {
					const endedInput = args[0] as InputObject;
					if (endedInput.UserInputType === Enum.UserInputType.MouseButton2) endFreeCameraLook();
					if (endedInput.UserInputType === Enum.UserInputType.MouseButton1 && ref.captureReleaseOnMouseUp !== false) finishCapture();
				});
			}
		};

		const captureFromControl = (): void => {
			if (ref.captureInput !== true) return;
			if (ref.captured === true) return;
			ref.captured = true;
			ref.captureReleaseOnMouseUp = false;
			ref.dragStart = undefined;
			ref.lastDrag = undefined;
			if (ref.freeCamera === true) bindFreeCameraControls(ref);
			ref.onCaptureChanged?.(true);

			if (inputService !== undefined) {
				if (ref.inputChangedConnection !== undefined) ref.inputChangedConnection.Disconnect();
				if (ref.inputEndedConnection !== undefined) ref.inputEndedConnection.Disconnect();
				ref.inputChangedConnection = connectEvent(inputService, "InputChanged", (...args: ReadonlyArray<unknown>) => {
					updateCapture(args[0] as InputObject);
				});
				ref.inputEndedConnection = connectEvent(inputService, "InputEnded", (...args: ReadonlyArray<unknown>) => {
					const endedInput = args[0] as InputObject;
					if (endedInput.UserInputType === Enum.UserInputType.MouseButton2) endFreeCameraLook();
					if (endedInput.UserInputType === Enum.UserInputType.MouseButton1 && ref.captureReleaseOnMouseUp !== false) finishCapture();
				});
			}
		};

		const beginFreeCameraLook = (input: InputObject, requirePointInside = false): void => {
			if (input.UserInputType !== Enum.UserInputType.MouseButton2) return;
			if (ref.freeCamera !== true || ref.captured !== true) return;
			if (requirePointInside && !pointInsideGuiObject(ref.inputCapture, input)) return;
			if (!isTopGuiTarget(ref.inputCapture, input, undefined, inputService)) return;
			const start = inputPosition(input);
			ref.freeCameraLookDragging = true;
			ref.dragStart = start;
			ref.lastDrag = start;
			ref.dragTotal = new Vector2(0, 0);
			lockFreeCameraMouse(ref, inputService);
			beginPointerDrag();
		};

		const endFreeCameraLook = (): void => {
			if (ref.freeCameraLookDragging !== true) return;
			ref.freeCameraLookDragging = undefined;
			restoreFreeCameraMouse(ref, inputService);
			ref.dragStart = undefined;
			ref.lastDrag = undefined;
			ref.dragTotal = undefined;
			endPointerDrag();
		};

		const toggleFreeCameraCapture = (input: InputObject, requirePointInside = false): void => {
			if (input.UserInputType !== Enum.UserInputType.MouseButton1) return;
			if (ref.freeCamera !== true) return;
			if (!modifierKeysDown(inputService)) return;
			if (requirePointInside && !pointInsideGuiObject(ref.inputCapture, input)) return;
			if (!isTopGuiTarget(ref.inputCapture, input, undefined, inputService)) return;
			if (ref.captured === true) ref.endCapture?.();
			else beginCapture(input, requirePointInside, false);
		};

		const handleInputBegan = (input: InputObject, requirePointInside = false): void => {
			if (input.KeyCode === Enum.KeyCode.Escape && ref.captured === true) {
				ref.endCapture?.();
				return;
			}
			if (ref.freeCamera === true) {
				beginFreeCameraLook(input, requirePointInside);
				toggleFreeCameraCapture(input, requirePointInside);
				return;
			}
			beginCapture(input, requirePointInside);
		};

		const handleMouseInputBegan = (input: InputObject, requirePointInside = false): void => {
			const lastToggleClock = ref.lastMouseCaptureToggleClock;
			const position = inputPosition(input);
			const lastTogglePosition = ref.lastMouseCaptureTogglePosition;
			if (
				lastToggleClock !== undefined &&
				lastTogglePosition !== undefined &&
				position !== undefined &&
				os.clock() - lastToggleClock < 0.2 &&
				math.abs(position.X - lastTogglePosition.X) <= 1 &&
				math.abs(position.Y - lastTogglePosition.Y) <= 1
			) return;
			const wasCaptured = ref.captured === true;
			handleInputBegan(input, requirePointInside);
			if ((ref.captured === true) !== wasCaptured) {
				ref.lastMouseCaptureToggleClock = os.clock();
				ref.lastMouseCaptureTogglePosition = position;
			}
		};

		ref.endCapture = finishCapture;
		ref.startCapture = captureFromControl;
		connectEvent(inputCapture, "InputBegan", (...args: ReadonlyArray<unknown>) => {
			const input = args[0] as InputObject;
			if (input.UserInputType === Enum.UserInputType.MouseButton1) handleMouseInputBegan(input);
			else handleInputBegan(input);
		});
		connectEvent(inputCapture, "InputChanged", (...args: ReadonlyArray<unknown>) => {
			if (inputService === undefined) updateCapture(args[0] as InputObject);
		});
		connectEvent(inputCapture, "InputEnded", (...args: ReadonlyArray<unknown>) => {
			if (inputService !== undefined) return;
			const endedInput = args[0] as InputObject;
			if (endedInput.UserInputType === Enum.UserInputType.MouseButton2) endFreeCameraLook();
			if (endedInput.UserInputType === Enum.UserInputType.MouseButton1 && ref.captureReleaseOnMouseUp !== false) finishCapture();
		});
		if (inputService !== undefined) {
			ref.inputBeganConnection = connectEvent(inputService, "InputBegan", (...args: ReadonlyArray<unknown>) => {
				const input = args[0] as InputObject;
				if (input.UserInputType === Enum.UserInputType.MouseButton1) handleMouseInputBegan(input, true);
				else handleInputBegan(input, true);
			});
		}

		return root;
	}) as unknown as ViewportFrameRefs;

	refs.store = store;
	const freeCamera = freeCameraConfig(options.freeCamera);
	refs.freeCamera = freeCamera !== undefined && freeCamera.enabled !== false;
	refs.freeCameraSpeed = freeCamera?.speed ?? DEFAULT_FREE_CAMERA_SPEED;
	refs.freeCameraSprintMultiplier = freeCamera?.sprintMultiplier ?? DEFAULT_FREE_CAMERA_SPRINT_MULTIPLIER;
	refs.freeCameraLookSensitivity = freeCamera?.lookSensitivity ?? DEFAULT_FREE_CAMERA_LOOK_SENSITIVITY;
	refs.captureInput = options.captureInput === true || refs.freeCamera === true;
	refs.onCaptureChanged = options.onCaptureChanged;
	refs.onDrag = options.onDrag;
	refs.inputCapture.Visible = refs.captureInput;
	refs.inputCapture.Active = refs.captureInput;
	if (refs.captureInput !== true) refs.endCapture?.();

	__useEffect("viewportFrame:cleanup", () => {
		return () => {
			refs.endCapture?.();
			refs.inputBeganConnection?.Disconnect();
			refs.inputBeganConnection = undefined;
		};
	});

	const registrations = new Array<ViewportRegistration>();
	const scope: ViewportFrameScope = {
		register(registration: ViewportRegistration): ViewportItemHandle {
			registrations.push(registration);
			return {
				clone() {
					return store.items.get(registration.id)?.clone;
				},
			};
		},
	};
	provideContext(contexts.viewportFrameState, scope);
	if (children !== undefined) __scope("viewportFrame:items", children);
	reconcileViewportItems(store, refs.worldModel, registrations);

	refs.root.Size = udim2(0, options.width ?? DEFAULT_WIDTH, 0, options.height ?? DEFAULT_HEIGHT);
	refs.viewport.BackgroundColor3 = options.backgroundColor ?? style.frameBgColor;
	refs.viewport.BackgroundTransparency = options.backgroundTransparency ?? 0;
	refs.viewport.BorderSizePixel = options.border === true ? 1 : 0;
	refs.viewport.BorderColor3 = style.borderColor ?? c(70, 70, 70);
	refs.viewport.CurrentCamera = refs.camera;
	applyCamera(refs, options);

	return {
		instance() {
			return refs.viewport;
		},
		worldModel() {
			return refs.worldModel;
		},
		camera() {
			return refs.camera;
		},
		itemCount() {
			return store.order.size();
		},
		captured() {
			return refs.captured === true;
		},
		captureInput() {
			refs.startCapture?.();
		},
		releaseInput() {
			refs.endCapture?.();
		},
	};
}, "@rovy/ui/viewportFrameWidget");

/** @widget */
export function viewportFrame(options: ViewportFrameOptions, children: () => void): ViewportFrameHandle;
export function viewportFrame(children: () => void): ViewportFrameHandle;
export function viewportFrame(options?: ViewportFrameOptions): ViewportFrameHandle;
export function viewportFrame(
	first: ViewportFrameOptions | (() => void) = {},
	second?: () => void,
): ViewportFrameHandle {
	const options: ViewportFrameOptions = typeIs(first, "function") ? {} : first ?? {};
	const children = typeIs(first, "function") ? first : second;
	return __callWidget(
		"viewportFrame",
		viewportFrameWidget as (...args: unknown[]) => ViewportFrameHandle,
		options,
		children,
	);
}

/** @widget */
export const viewportItem = widget((options: ViewportItemOptions): ViewportItemHandle => {
	const [id] = __useState("viewportItem:id", () => {
		nextViewportItemId += 1;
		return `viewportItem:${nextViewportItemId}`;
	});
	const scope = useContext(contexts.viewportFrameState) as ViewportFrameScope | undefined;
	if (scope === undefined) error("[rovy-ui] viewportItem must be used inside viewportFrame", 2);
	return scope.register({ id, options });
}, "@rovy/ui/viewportItem");
