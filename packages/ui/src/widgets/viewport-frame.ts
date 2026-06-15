import { widget, __callWidget, __scope, __useInstance, __useState, provideContext, useContext } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { c, udim, udim2 } from "../primitives";
import * as contexts from "../contexts";

export interface ViewportCameraOptions {
	cframe: CFrame;
	fieldOfView?: number;
}

export interface ViewportFrameOptions {
	width?: number;
	height?: number;
	backgroundColor?: Color3;
	backgroundTransparency?: number;
	border?: boolean;
	camera?: ViewportCameraOptions;
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
	worldModel: WorldModel;
	camera: Camera;
	store?: ViewportFrameStore;
}

interface ViewportFrameScope {
	register(registration: ViewportRegistration): ViewportItemHandle;
}

let nextViewportItemId = 0;

const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 160;
const DEFAULT_FIELD_OF_VIEW = 35;

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
		dynamic.Size = dynamic.Size.mul(scale);
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

/** @widget */
const viewportFrameWidget = widget((options: ViewportFrameOptions = {}, children?: () => void): ViewportFrameHandle => {
	const [store] = __useState("viewportFrame:store", createViewportStore);
	const style = useStyle();

	const refs = __useInstance("viewportFrame:instance", (rawRef) => {
		const ref = rawRef as unknown as ViewportFrameRefs;
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
		const root = create("Frame", {
			[rawRef as never]: "root",
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
			Size: udim2(0, options.width ?? DEFAULT_WIDTH, 0, options.height ?? DEFAULT_HEIGHT),
			ClipsDescendants: true,
			0: create("UICorner", { CornerRadius: udim(0, style.cornerRadius) }),
			1: viewport,
		});
		camera.Parent = viewport;
		ref.store = store;
		return root;
	}) as unknown as ViewportFrameRefs;

	refs.store = store;

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
