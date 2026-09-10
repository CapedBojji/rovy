// @rovy/ui — retained class-based UI runtime.

import {
	type App,
	type Ctor,
	type Entity,
	type LifecycleKind,
	type LifecycleRecord,
	type LifecycleUnsubscribe,
	type ParamDescriptor,
	type QueryDescriptor,
	registerPostStartAppExtension,
	resolveParams,
} from "@rovy/core";

type Cleanup = () => void;
type Key = string | number;
type TriggerEvent = "added" | "changed" | "removed";
type PropsData = Record<string, unknown>;
type InstanceProps = Record<string, unknown>;

type QueryLike = {
	members(): Array<Entity>;
	rowFor?(entity: Entity): { values: { [k: number]: unknown }; n: number } | undefined;
	getDescriptor(): QueryDescriptor;
};

export type Props<T extends object = {}> = Readonly<T>;

export type UiChild = UiNode | false | undefined;
export type UiChildren = UiChild | ReadonlyArray<UiChild>;
export type UiNode = ComponentVNode | NativeVNode | FragmentVNode | PortalVNode;

export interface UiComponent {
	render: (...args: never[]) => UiChild;
}

export type UiComponentCtor<TProps extends object = {}> = new (props: Props<TProps>) => UiComponent;

export interface UiReg {
	readonly ctor: Ctor;
	readonly id: string;
	readonly methods: ReadonlyArray<string>;
	readonly params?: ReadonlyArray<ParamDescriptor>;
	readonly triggers?: ReadonlyArray<UiTriggerDescriptor>;
}

export interface UiMountOptions<TProps extends object = {}> {
	readonly target?: Instance;
	readonly name?: string;
	readonly props?: TProps;
}

export interface UiHandle {
	readonly destroy: Cleanup;
}

interface VNodeBase {
	readonly key?: Key;
	readonly __callsite?: string;
}

interface ComponentVNode extends VNodeBase {
	readonly kind: "component";
	readonly ctor: Ctor;
	readonly props: PropsData;
}

interface NativeVNode extends VNodeBase {
	readonly kind: "native";
	readonly className: string;
	readonly props: InstanceProps;
	readonly children: ReadonlyArray<UiNode>;
}

interface FragmentVNode extends VNodeBase {
	readonly kind: "fragment";
	readonly children: ReadonlyArray<UiNode>;
}

interface PortalVNode extends VNodeBase {
	readonly kind: "portal";
	readonly target: Instance;
	readonly children: ReadonlyArray<UiNode>;
}

export type BindingDescriptor =
	| { readonly kind: "prop"; readonly key: string }
	| { readonly kind: "value"; readonly value: unknown };

export type EntityBindingDescriptor = Entity | ReadonlyArray<Entity>;

export type UiTriggerDescriptor =
	| { readonly kind: "query"; readonly handle: string; readonly entities?: BindingDescriptor | EntityBindingDescriptor; readonly on: ReadonlyArray<TriggerEvent> }
	| { readonly kind: "component"; readonly ctor: Ctor; readonly entity?: BindingDescriptor; readonly on: ReadonlyArray<TriggerEvent> }
	| { readonly kind: "resource"; readonly ctor: Ctor }
	| { readonly kind: "event"; readonly ctor: Ctor }
	| {
		readonly kind: "relation";
		readonly ctor: Ctor;
		readonly source?: BindingDescriptor;
		readonly target?: BindingDescriptor;
		readonly on: ReadonlyArray<TriggerEvent>;
	}
	| { readonly kind: "lifecycle"; readonly lifecycleKind: LifecycleKind; readonly ctor?: Ctor }
	| { readonly kind: "props" };

export interface ComponentTriggerOptions {
	readonly entity?: BindingDescriptor;
	readonly on?: ReadonlyArray<TriggerEvent>;
}

export interface RelationTriggerOptions {
	readonly source?: BindingDescriptor;
	readonly target?: BindingDescriptor;
	readonly on?: ReadonlyArray<TriggerEvent>;
}

export interface QueryTriggerOptions {
	readonly entities?: EntityBindingDescriptor;
	readonly on?: ReadonlyArray<TriggerEvent>;
}

export interface LifecycleTriggerOptions {
	readonly ctor?: Ctor;
}

interface MountedUiState {
	readonly app: App;
	readonly target: Instance;
	readonly cleanups: Array<Cleanup>;
	readonly dirty: Set<ComponentNode>;
	destroyed: boolean;
	flushing: boolean;
	scheduled: boolean;
	root?: RuntimeNode;
}

interface BaseRuntimeNode {
	readonly kind: "component" | "native" | "fragment" | "portal";
	readonly key?: Key;
	readonly callsite?: string;
	parent: Instance;
}

interface ComponentNode extends BaseRuntimeNode {
	readonly kind: "component";
	readonly ctor: Ctor;
	readonly reg: UiReg;
	readonly instance: UiComponent;
	readonly props: PropsData;
	readonly locals: Map<number, unknown>;
	readonly cleanups: Array<Cleanup>;
	child?: RuntimeNode;
	destroyed: boolean;
}

interface NativeNode extends BaseRuntimeNode {
	readonly kind: "native";
	readonly className: string;
	readonly instance: Instance;
	readonly props: InstanceProps;
	readonly connections: Map<string, RBXScriptConnection>;
	children: Array<RuntimeNode>;
	/** Set when the author supplied LayoutOrder, so Rovy leaves it alone. */
	authoredLayoutOrder?: boolean;
}

interface FragmentNode extends BaseRuntimeNode {
	readonly kind: "fragment";
	children: Array<RuntimeNode>;
}

interface PortalNode extends BaseRuntimeNode {
	readonly kind: "portal";
	target: Instance;
	children: Array<RuntimeNode>;
}

type RuntimeNode = ComponentNode | NativeNode | FragmentNode | PortalNode;

interface QueryTriggerState {
	readonly query: QueryLike;
	readonly node: ComponentNode;
	readonly entities?: BindingDescriptor | EntityBindingDescriptor;
	readonly on: ReadonlyArray<TriggerEvent>;
	previous: Map<Entity, Array<unknown>>;
}

const registry = new Array<UiReg>();

registerPostStartAppExtension((app) => {
	app.consumeMountRequests((request) => {
		if (findUiRegOrUndefined(request.ctor as Ctor) === undefined) return;
		mountUi(app, request.ctor as UiComponentCtor, {
			target: request.target,
			name: request.options?.name,
			props: request.options?.props ?? {},
		});
	});
});

export function ui(_ctor: Ctor): void {}

export function mountUi<TProps extends object = {}>(
	app: App,
	rootCtor: UiComponentCtor<TProps>,
	options: UiMountOptions<TProps> = {},
): UiHandle {
	assert(app.isStarted(), "[rovy/ui] mountUi requires app.start() to run first");
	const reg = findUiReg(rootCtor as unknown as Ctor);
	const [target, cleanupTarget] = resolveTarget(reg, options);
	const state: MountedUiState = {
		app,
		target,
		cleanups: [],
		dirty: new Set(),
		destroyed: false,
		flushing: false,
		scheduled: false,
	};
	if (cleanupTarget !== undefined) state.cleanups.push(cleanupTarget);
	state.cleanups.push(app.on_post_flush(() => flushDirty(state)));
	state.root = mountNode(state, child(rootCtor, (options.props ?? {}) as TProps), target);
	return {
		destroy: () => destroyMountedUi(state),
	};
}

export function unmountUi(handle: UiHandle): void {
	handle.destroy();
}

function propMacro<T = unknown>(key: string): BindingDescriptor & T {
	return { kind: "prop", key } as BindingDescriptor & T;
}

export { propMacro as $prop };

function queryTriggerMacro<_Terms extends ReadonlyArray<unknown>, _F1 = void, _F2 = void, _F3 = void, _F4 = void, _F5 = void>(
	options: QueryTriggerOptions = {},
): UiTriggerDescriptor {
	return { kind: "query", handle: "", entities: options.entities, on: options.on ?? allTriggerEvents() };
}

function componentTriggerMacro(ctor: Ctor, options: ComponentTriggerOptions = {}): UiTriggerDescriptor {
	return { kind: "component", ctor, entity: options.entity, on: options.on ?? allTriggerEvents() };
}

function resourceTriggerMacro(ctor: Ctor): UiTriggerDescriptor {
	return { kind: "resource", ctor };
}

/**
 * Rerender when an event is sent.
 *
 * Pass the event class directly for an `@event` you declared. Events owned by a
 * companion package have no class to name — `@rovy/datastore` keys its document
 * events off a transformer-generated document id — so name the event *type*
 * instead and let the transformer resolve the constructor, exactly as it does
 * for an `EventReader<...>` param:
 *
 * ```ts
 * static rerender = [$eventTrigger<DocumentChanged<typeof Profile>>()];
 * ```
 */
function eventTriggerMacro(ctor: Ctor): UiTriggerDescriptor;
function eventTriggerMacro<E>(): UiTriggerDescriptor;
function eventTriggerMacro(ctor?: Ctor): UiTriggerDescriptor {
	assert(
		ctor !== undefined,
		"[rovy/ui] $eventTrigger<E>() reached runtime untransformed — is rovy-transformer in tsconfig plugins?",
	);
	return { kind: "event", ctor };
}

function relationTriggerMacro(ctor: Ctor, options: RelationTriggerOptions = {}): UiTriggerDescriptor {
	return { kind: "relation", ctor, source: options.source, target: options.target, on: options.on ?? allTriggerEvents() };
}

function lifecycleTriggerMacro(lifecycleKind: LifecycleKind, options: LifecycleTriggerOptions = {}): UiTriggerDescriptor {
	return { kind: "lifecycle", lifecycleKind, ctor: options.ctor };
}

function propsTriggerMacro(): UiTriggerDescriptor {
	return { kind: "props" };
}

export {
	queryTriggerMacro as $queryTrigger,
	componentTriggerMacro as $componentTrigger,
	resourceTriggerMacro as $resourceTrigger,
	eventTriggerMacro as $eventTrigger,
	relationTriggerMacro as $relationTrigger,
	lifecycleTriggerMacro as $lifecycleTrigger,
	propsTriggerMacro as $propsTrigger,
};

export interface ChildOptions {
	readonly key?: Key;
	readonly __callsite?: string;
}

export function child<TProps extends object>(
	ctor: UiComponentCtor<TProps>,
	props?: TProps,
	options: ChildOptions = {},
): UiNode {
	return {
		kind: "component",
		ctor: ctor as unknown as Ctor,
		props: normalizeProps(props),
		key: options.key,
		__callsite: options.__callsite,
	};
}

export function fragment(children?: UiChildren, options: ChildOptions = {}): UiNode {
	return {
		kind: "fragment",
		children: normalizeChildren(children),
		key: options.key,
		__callsite: options.__callsite,
	};
}

export function portal(target: Instance, children?: UiChildren, options: ChildOptions = {}): UiNode {
	return {
		kind: "portal",
		target,
		children: normalizeChildren(children),
		key: options.key,
		__callsite: options.__callsite,
	};
}

export function native(className: string, props?: InstanceProps, children?: UiChildren, options: ChildOptions = {}): UiNode {
	const cleanProps = normalizeProps(props);
	const key = options.key ?? readKey(cleanProps);
	const callsite = options.__callsite ?? readCallsite(cleanProps);
	delete cleanProps.key;
	delete cleanProps.__callsite;
	delete cleanProps.children;
	return {
		kind: "native",
		className,
		props: cleanProps,
		children: normalizeChildren(children ?? props?.children as UiChildren),
		key,
		__callsite: callsite,
	};
}

export function frame(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("Frame", props, children);
}
export function screenGui(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("ScreenGui", props, children);
}
export function billboardGui(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("BillboardGui", props, children);
}
export function surfaceGui(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("SurfaceGui", props, children);
}
export function textLabel(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("TextLabel", props, children);
}
export function textButton(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("TextButton", props, children);
}
export function imageLabel(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("ImageLabel", props, children);
}
export function imageButton(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("ImageButton", props, children);
}
export function scrollingFrame(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("ScrollingFrame", props, children);
}
export function canvasGroup(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("CanvasGroup", props, children);
}
export function textBox(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("TextBox", props, children);
}
export function viewportFrame(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("ViewportFrame", props, children);
}
/**
 * Roblox defaults `SortOrder` to `Name`, which would order children
 * alphabetically instead of the order they were written. Rovy numbers children
 * by declaration order (see assignLayoutOrder), so sort by that unless the
 * caller asks for something else.
 */
function withLayoutSortOrder(props?: InstanceProps): InstanceProps {
	if (props !== undefined && props.SortOrder !== undefined) return props;
	const merged: InstanceProps = { ...(props ?? {}) };
	merged.SortOrder = Enum.SortOrder.LayoutOrder;
	return merged;
}

export function uiListLayout(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("UIListLayout", withLayoutSortOrder(props), children);
}
export function uiGridLayout(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("UIGridLayout", withLayoutSortOrder(props), children);
}
export function uiPadding(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("UIPadding", props, children);
}
export function uiCorner(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("UICorner", props, children);
}
export function uiStroke(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("UIStroke", props, children);
}
export function uiScale(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("UIScale", props, children);
}
export function uiAspectRatioConstraint(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("UIAspectRatioConstraint", props, children);
}
export function uiSizeConstraint(props?: InstanceProps, children?: UiChildren): UiNode {
	return native("UISizeConstraint", props, children);
}

export const Fragment = fragment;

export function jsx(nodeType: unknown, props?: InstanceProps, key?: Key): UiNode {
	const children = props?.children as UiChildren;
	if (typeIs(nodeType, "string")) return native(nodeType as string, { ...(props ?? {}), key }, children);
	return child(nodeType as UiComponentCtor, (props ?? {}) as never, { key });
}

export const jsxs = jsx;

export const rovyUi = {
	registry,
	native,
	child,
	fragment,
	jsx,
	jsxs,
	Fragment,

	__ui(ctor: Ctor, meta: Omit<UiReg, "ctor">): void {
		registry.push({ ctor, ...meta });
	},

	__reset(): void {
		while (registry.size() > 0) registry.pop();
	},

	__callsite<T extends UiNode | undefined>(node: T, callsite: string): T {
		if (node !== undefined) (node as { __callsite?: string }).__callsite = callsite;
		return node;
	},
};

export default rovyUi;

function mountNode(state: MountedUiState, vnode: UiNode, parent: Instance): RuntimeNode {
	switch (vnode.kind) {
		case "component":
			return mountComponent(state, vnode, parent);
		case "native":
			return mountNative(state, vnode, parent);
		case "fragment":
			return mountFragment(state, vnode, parent);
		case "portal":
			return mountPortal(state, vnode, parent);
	}
}

function mountComponent(state: MountedUiState, vnode: ComponentVNode, parent: Instance): ComponentNode {
	const reg = findUiReg(vnode.ctor);
	const props = normalizeProps(vnode.props);
	const factory = vnode.ctor as unknown as new (props: PropsData) => UiComponent;
	const node: ComponentNode = {
		kind: "component",
		ctor: vnode.ctor,
		reg,
		instance: new factory(props),
		props,
		locals: new Map(),
		cleanups: [],
		parent,
		key: vnode.key,
		callsite: vnode.__callsite,
		destroyed: false,
	};
	subscribeTriggers(state, node);
	renderComponent(state, node);
	return node;
}

function mountNative(state: MountedUiState, vnode: NativeVNode, parent: Instance): NativeNode {
	const instance = new Instance(vnode.className as keyof CreatableInstances);
	const node: NativeNode = {
		kind: "native",
		className: vnode.className,
		instance,
		props: {},
		connections: new Map(),
		children: [],
		parent,
		key: vnode.key,
		callsite: vnode.__callsite,
	};
	patchNativeProps(node, vnode.props);
	instance.Parent = parent;
	node.children = reconcileChildren(state, [], vnode.children, instance);
	return node;
}

function mountFragment(state: MountedUiState, vnode: FragmentVNode, parent: Instance): FragmentNode {
	return {
		kind: "fragment",
		parent,
		key: vnode.key,
		callsite: vnode.__callsite,
		children: reconcileChildren(state, [], vnode.children, parent),
	};
}

function mountPortal(state: MountedUiState, vnode: PortalVNode, parent: Instance): PortalNode {
	return {
		kind: "portal",
		parent,
		target: vnode.target,
		key: vnode.key,
		callsite: vnode.__callsite,
		children: reconcileChildren(state, [], vnode.children, vnode.target),
	};
}

function reconcileNode(state: MountedUiState, oldNode: RuntimeNode | undefined, vnode: UiNode | undefined, parent: Instance): RuntimeNode | undefined {
	if (vnode === undefined) {
		if (oldNode !== undefined) destroyNode(oldNode);
		return undefined;
	}
	if (oldNode === undefined || !sameIdentity(oldNode, vnode)) {
		if (oldNode !== undefined) destroyNode(oldNode);
		return mountNode(state, vnode, parent);
	}
	reparentNode(oldNode, parent);
	switch (oldNode.kind) {
		case "component":
			reconcileComponent(state, oldNode, vnode as ComponentVNode);
			return oldNode;
		case "native":
			reconcileNative(state, oldNode, vnode as NativeVNode);
			return oldNode;
		case "fragment":
			reconcileFragment(state, oldNode, vnode as FragmentVNode);
			return oldNode;
		case "portal":
			reconcilePortal(state, oldNode, vnode as PortalVNode);
			return oldNode;
	}
}

function reconcileComponent(state: MountedUiState, node: ComponentNode, vnode: ComponentVNode): void {
	if (updateProps(node.props, vnode.props)) {
		renderComponent(state, node);
	}
}

function reconcileNative(state: MountedUiState, node: NativeNode, vnode: NativeVNode): void {
	patchNativeProps(node, vnode.props);
	node.children = reconcileChildren(state, node.children, vnode.children, node.instance);
}

function reconcileFragment(state: MountedUiState, node: FragmentNode, vnode: FragmentVNode): void {
	node.children = reconcileChildren(state, node.children, vnode.children, node.parent);
}

function reconcilePortal(state: MountedUiState, node: PortalNode, vnode: PortalVNode): void {
	node.target = vnode.target;
	for (const childNode of node.children) reparentNode(childNode, vnode.target);
	node.children = reconcileChildren(state, node.children, vnode.children, node.target);
}

function reparentNode(node: RuntimeNode, parent: Instance): void {
	node.parent = parent;
	switch (node.kind) {
		case "component":
			if (node.child !== undefined) reparentNode(node.child, parent);
			break;
		case "native":
			if (node.instance.Parent !== parent) node.instance.Parent = parent;
			break;
		case "fragment":
			for (const childNode of node.children) reparentNode(childNode, parent);
			break;
		case "portal":
			break;
	}
}

function reconcileChildren(
	state: MountedUiState,
	oldChildren: ReadonlyArray<RuntimeNode>,
	newChildren: ReadonlyArray<UiNode>,
	parent: Instance,
): Array<RuntimeNode> {
	const available = new Map<string, Array<RuntimeNode>>();
	for (const childNode of oldChildren) {
		const key = runtimeIdentity(childNode);
		const bucket = available.get(key) ?? [];
		bucket.push(childNode);
		available.set(key, bucket);
	}
	const reconciled = new Array<RuntimeNode>();
	for (const childVNode of newChildren) {
		const key = vnodeIdentity(childVNode);
		const bucket = available.get(key);
		let oldNode: RuntimeNode | undefined;
		if (bucket !== undefined) {
			for (let i = 0; i < bucket.size(); i++) {
				if (!sameIdentity(bucket[i], childVNode)) continue;
				oldNode = bucket.remove(i);
				break;
			}
		}
		const node = reconcileNode(state, oldNode, childVNode, parent);
		if (node !== undefined) reconciled.push(node);
	}
	for (const [, bucket] of available) {
		for (const stale of bucket) destroyNode(stale);
	}
	assignLayoutOrder(reconciled);
	return reconciled;
}

function renderComponent(state: MountedUiState, node: ComponentNode): void {
	if (node.destroyed) return;
	const render = node.instance.render as unknown as (self: UiComponent, ...args: Array<unknown>) => UiChild;
	assert(typeIs(render, "function"), `[rovy/ui] @ui '${node.reg.id}' requires render(...)`);
	const ctx = state.app.createResolveCtx(-1);
	ctx.locals = node.locals;
	const args = node.reg.params !== undefined ? resolveParams(node.reg.params, ctx) : [];
	const output = render(node.instance, ...args);
	node.child = reconcileNode(state, node.child, normalizeChild(output), node.parent);
}

/**
 * Give every rendered GuiObject a LayoutOrder matching the order it was
 * written, so a UIListLayout/UIGridLayout lays children out the way the render
 * reads. Fragments and components are flattened, because their children are
 * parented alongside their siblings. An explicit LayoutOrder always wins.
 */
function assignLayoutOrder(nodes: ReadonlyArray<RuntimeNode>): void {
	let order = 0;
	const visit = (node: RuntimeNode): void => {
		if (node.kind === "native") {
			const instance = node.instance;
			if (instance.IsA("GuiObject")) {
				order += 1;
				if (node.authoredLayoutOrder !== true) instance.LayoutOrder = order;
			}
			return;
		}
		if (node.kind === "component") {
			if (node.child !== undefined) visit(node.child);
			return;
		}
		// Portals parent elsewhere, so they take no slot among these siblings.
		if (node.kind === "fragment") {
			for (const child of node.children) visit(child);
		}
	};
	for (const node of nodes) visit(node);
}

function patchNativeProps(node: NativeNode, nextProps: InstanceProps): void {
	node.authoredLayoutOrder = nextProps.LayoutOrder !== undefined;
	for (const [key] of pairs(node.props)) {
		if (nextProps[key] === undefined) clearNativeProp(node, key);
	}
	for (const [key, value] of pairs(nextProps)) {
		if (key === "key" || key === "__callsite" || key === "children") continue;
		if (node.props[key] === value) continue;
		setNativeProp(node, key, value);
	}
}

function setNativeProp(node: NativeNode, key: string, value: unknown): void {
	node.props[key] = value;
	if (key === "events" && isRecord(value)) {
		patchEvents(node, value);
		return;
	}
	if (key === "ref" && typeIs(value, "function")) {
		(value as (instance: Instance) => void)(node.instance);
		return;
	}
	(node.instance as unknown as Record<string, unknown>)[key] = value;
}

function clearNativeProp(node: NativeNode, key: string): void {
	delete node.props[key];
	if (key === "events") {
		for (const [, connection] of node.connections) connection.Disconnect();
		node.connections.clear();
	}
}

function patchEvents(node: NativeNode, events: Record<string, unknown>): void {
	for (const [name, connection] of node.connections) {
		if (events[name] === undefined) {
			connection.Disconnect();
			node.connections.delete(name);
		}
	}
	for (const [name, callback] of pairs(events)) {
		const previous = node.connections.get(name);
		if (previous !== undefined) previous.Disconnect();
		if (!typeIs(callback, "function")) continue;
		const signal = (node.instance as unknown as Record<string, RBXScriptSignal>)[name];
		if (signal !== undefined && typeIs((signal as { Connect?: unknown }).Connect, "function")) {
			node.connections.set(name, signal.Connect((...args: Array<unknown>) => {
				(callback as (instance: Instance, ...args: Array<unknown>) => void)(node.instance, ...args);
			}));
		}
	}
}

function subscribeTriggers(state: MountedUiState, node: ComponentNode): void {
	for (const trigger of node.reg.triggers ?? []) {
		switch (trigger.kind) {
			case "query":
				subscribeQueryTrigger(state, node, trigger);
				break;
			case "component":
				subscribeComponentTrigger(state, node, trigger);
				break;
			case "resource":
				track(node, state.app.on_resource_changed(trigger.ctor, () => markDirty(state, node)));
				break;
			case "event":
				track(node, state.app.eventRegistry.observe(trigger.ctor, () => markDirty(state, node)));
				track(node, state.app.on_post_flush(() => {
					if (state.app.eventRegistry.readerSize(trigger.ctor) > 0) markDirty(state, node);
				}));
				break;
			case "relation":
				subscribeRelationTrigger(state, node, trigger);
				break;
			case "lifecycle":
				track(node, state.app.lifecycle.on(trigger.lifecycleKind, trigger.ctor ?? (() => markDirty(state, node)), trigger.ctor !== undefined ? (() => markDirty(state, node)) : undefined));
				break;
			case "props":
				break;
		}
	}
}

function subscribeQueryTrigger(
	state: MountedUiState,
	node: ComponentNode,
	trigger: Extract<UiTriggerDescriptor, { kind: "query" }>,
): void {
	const query = state.app.scheduler.queries.get(trigger.handle) as QueryLike | undefined;
	assert(query !== undefined, `[rovy/ui] query trigger handle not found: ${trigger.handle}`);
	const source: QueryTriggerState = {
		query,
		node,
		entities: trigger.entities,
		on: trigger.on,
		previous: snapshotQuery(query),
	};
	const check = () => {
		if (queryTriggerChanged(source)) markDirty(state, node);
	};
	track(node, state.app.on_entity_spawned(check));
	track(node, state.app.on_entity_despawned(check));
	track(node, state.app.on_component_added(check));
	track(node, state.app.on_component_changed(check));
	track(node, state.app.on_component_removed(check));
	track(node, state.app.on_relation_added(check));
	track(node, state.app.on_relation_changed(check));
	track(node, state.app.on_relation_removed(check));
}

function subscribeComponentTrigger(
	state: MountedUiState,
	node: ComponentNode,
	trigger: Extract<UiTriggerDescriptor, { kind: "component" }>,
): void {
	const listen = (event: TriggerEvent, subscribe: (ctor: Ctor, cb: (record: LifecycleRecord) => void) => LifecycleUnsubscribe) => {
		if (!includesEvent(trigger.on, event)) return;
		track(node, subscribe(trigger.ctor, (record) => {
			if (bindingMatches(node, trigger.entity, record.entity)) markDirty(state, node);
		}));
	};
	listen("added", (ctor, cb) => state.app.on_component_added(ctor, cb));
	listen("changed", (ctor, cb) => state.app.on_component_changed(ctor, cb));
	listen("removed", (ctor, cb) => state.app.on_component_removed(ctor, cb));
}

function subscribeRelationTrigger(
	state: MountedUiState,
	node: ComponentNode,
	trigger: Extract<UiTriggerDescriptor, { kind: "relation" }>,
): void {
	const listen = (event: TriggerEvent, subscribe: (ctor: Ctor, cb: (record: LifecycleRecord) => void) => LifecycleUnsubscribe) => {
		if (!includesEvent(trigger.on, event)) return;
		track(node, subscribe(trigger.ctor, (record) => {
			if (!bindingMatches(node, trigger.source, record.entity)) return;
			if (!bindingMatches(node, trigger.target, record.target)) return;
			markDirty(state, node);
		}));
	};
	listen("added", (ctor, cb) => state.app.on_relation_added(ctor, cb));
	listen("changed", (ctor, cb) => state.app.on_relation_changed(ctor, cb));
	listen("removed", (ctor, cb) => state.app.on_relation_removed(ctor, cb));
}

function queryTriggerChanged(source: QueryTriggerState): boolean {
	const current = snapshotQuery(source.query);
	let changed = false;
	for (const [entity, values] of current) {
		if (!entityBindingMatches(source.node, source.entities, entity)) continue;
		const old = source.previous.get(entity);
		if (old === undefined) {
			if (includesEvent(source.on, "added")) changed = true;
		} else if (!rowValuesEqual(old, values)) {
			if (includesEvent(source.on, "changed")) changed = true;
		}
	}
	for (const [entity] of source.previous) {
		if (!entityBindingMatches(source.node, source.entities, entity)) continue;
		if (!current.has(entity) && includesEvent(source.on, "removed")) changed = true;
	}
	source.previous = current;
	return changed;
}

function snapshotQuery(query: QueryLike): Map<Entity, Array<unknown>> {
	const out = new Map<Entity, Array<unknown>>();
	for (const entity of query.members()) {
		const row = query.rowFor?.(entity);
		const values = new Array<defined>();
		if (row !== undefined) {
			for (let i = 1; i <= row.n; i++) values.push(row.values[i] as defined);
		}
		out.set(entity, values as Array<unknown>);
	}
	return out;
}

function markDirty(state: MountedUiState, node: ComponentNode): void {
	if (state.destroyed || node.destroyed) return;
	state.dirty.add(node);
	scheduleFlush(state);
}

function scheduleFlush(state: MountedUiState): void {
	if (state.scheduled || state.flushing) return;
	state.scheduled = true;
	task.defer(() => {
		state.scheduled = false;
		flushDirty(state);
	});
}

function flushDirty(state: MountedUiState): void {
	if (state.destroyed || state.flushing || state.dirty.size() === 0) return;
	state.flushing = true;
	const dirty = new Array<ComponentNode>();
	for (const node of state.dirty) dirty.push(node);
	state.dirty.clear();
	// Isolate each render: a throwing render() must not starve sibling nodes or
	// leave state.flushing stuck true (which would silently freeze every future
	// re-render for this mount). The failed node stays out of state.dirty and
	// re-renders on its next trigger. Mount-time renders stay fail-fast.
	for (const node of dirty) {
		const [ok, err] = pcall(() => renderComponent(state, node));
		if (!ok) warn(`[rovy/ui] render failed for '${node.reg.id}': ${tostring(err)}`);
	}
	state.flushing = false;
	if (state.dirty.size() > 0) scheduleFlush(state);
}

function destroyMountedUi(state: MountedUiState): void {
	if (state.destroyed) return;
	state.destroyed = true;
	if (state.root !== undefined) destroyNode(state.root);
	while (state.cleanups.size() > 0) {
		const cleanup = state.cleanups.pop();
		if (cleanup !== undefined) cleanup();
	}
}

function destroyNode(node: RuntimeNode): void {
	switch (node.kind) {
		case "component":
			node.destroyed = true;
			if (node.child !== undefined) destroyNode(node.child);
			while (node.cleanups.size() > 0) {
				const cleanup = node.cleanups.pop();
				if (cleanup !== undefined) cleanup();
			}
			break;
		case "native":
			for (const childNode of node.children) destroyNode(childNode);
			for (const [, connection] of node.connections) connection.Disconnect();
			node.connections.clear();
			node.instance.Destroy();
			break;
		case "fragment":
			for (const childNode of node.children) destroyNode(childNode);
			break;
		case "portal":
			for (const childNode of node.children) destroyNode(childNode);
			break;
	}
}

function sameIdentity(node: RuntimeNode, vnode: UiNode): boolean {
	if (node.kind !== vnode.kind) return false;
	if (identityKey(node.key, node.callsite) !== identityKey(vnode.key, vnode.__callsite)) return false;
	if (node.kind === "component") return node.ctor === (vnode as ComponentVNode).ctor;
	if (node.kind === "native") return node.className === (vnode as NativeVNode).className;
	return true;
}

function runtimeIdentity(node: RuntimeNode): string {
	return `${node.kind}:${node.kind === "component" ? tostring(node.ctor) : node.kind === "native" ? node.className : node.kind}:${identityKey(node.key, node.callsite)}`;
}

function vnodeIdentity(vnode: UiNode): string {
	return `${vnode.kind}:${vnode.kind === "component" ? tostring(vnode.ctor) : vnode.kind === "native" ? vnode.className : vnode.kind}:${identityKey(vnode.key, vnode.__callsite)}`;
}

function identityKey(key: Key | undefined, callsite: string | undefined): string {
	if (key !== undefined) return `key:${tostring(key)}`;
	if (callsite !== undefined) return `callsite:${callsite}`;
	return "implicit";
}

function normalizeChild(childNode: UiChild): UiNode | undefined {
	if (childNode === false || childNode === undefined) return undefined;
	return childNode;
}

function normalizeChildren(children: UiChildren | undefined): ReadonlyArray<UiNode> {
	if (children === undefined || children === false) return [];
	if (isUiNode(children)) return [children];
	const out = new Array<UiNode>();
	for (const childNode of children as ReadonlyArray<UiChild>) {
		const normalized = normalizeChild(childNode);
		if (normalized !== undefined) out.push(normalized);
	}
	return out;
}

function isUiNode(value: unknown): value is UiNode {
	return isRecord(value) && typeIs((value as { kind?: unknown }).kind, "string");
}

function normalizeProps<T extends object>(props: T | undefined): PropsData {
	if (props === undefined) return {};
	return { ...(props as PropsData) };
}

function updateProps(current: PropsData, nextRaw: PropsData): boolean {
	const nextProps = normalizeProps(nextRaw);
	let changed = false;
	for (const [key] of pairs(current)) {
		if (nextProps[key] === undefined) {
			delete current[key];
			changed = true;
		}
	}
	for (const [key, value] of pairs(nextProps)) {
		if (current[key] !== value) {
			current[key] = value;
			changed = true;
		}
	}
	return changed;
}

function bindingMatches(node: ComponentNode, binding: BindingDescriptor | undefined, actual: unknown): boolean {
	if (binding === undefined) return true;
	if (actual === undefined) return false;
	const expected = binding.kind === "prop" ? node.props[binding.key] : binding.value;
	return expected === actual;
}

function entityBindingMatches(node: ComponentNode, binding: BindingDescriptor | EntityBindingDescriptor | undefined, entity: Entity): boolean {
	if (binding === undefined) return true;
	const expected = isBindingDescriptor(binding) ? (binding.kind === "prop" ? node.props[binding.key] : binding.value) : binding;
	if (expected === undefined) return false;
	if (expected === entity) return true;
	if (typeIs(expected, "table")) {
		for (const [, item] of pairs(expected as Record<number, unknown>)) {
			if (item === entity) return true;
		}
	}
	return false;
}

function isBindingDescriptor(value: BindingDescriptor | EntityBindingDescriptor): value is BindingDescriptor {
	const maybe = value as Partial<BindingDescriptor>;
	return typeIs(value, "table") && (maybe.kind === "prop" || maybe.kind === "value");
}

function readKey(props: InstanceProps): Key | undefined {
	const value = props.key;
	return typeIs(value, "string") || typeIs(value, "number") ? value : undefined;
}

function readCallsite(props: InstanceProps): string | undefined {
	const value = props.__callsite;
	return typeIs(value, "string") ? value : undefined;
}

function includesEvent(events: ReadonlyArray<TriggerEvent>, event: TriggerEvent): boolean {
	for (const item of events) if (item === event) return true;
	return false;
}

function allTriggerEvents(): ReadonlyArray<TriggerEvent> {
	return ["added", "changed", "removed"];
}

function rowValuesEqual(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
	if (a.size() !== b.size()) return false;
	for (let i = 0; i < a.size(); i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function findUiReg(ctor: Ctor): UiReg {
	const reg = findUiRegOrUndefined(ctor);
	if (reg !== undefined) return reg;
	error(`[rovy/ui] @ui class is not registered: ${tostring(ctor)}`);
}

function findUiRegOrUndefined(ctor: Ctor): UiReg | undefined {
	for (const reg of registry) {
		if (reg.ctor === ctor) return reg;
	}
	return undefined;
}

function resolveTarget(reg: UiReg, options: UiMountOptions): LuaTuple<[Instance, Cleanup | undefined]> {
	if (options.target !== undefined) return $tuple(options.target, undefined);
	const gui = new Instance("ScreenGui");
	gui.Name = options.name ?? defaultGuiName(reg);
	gui.ResetOnSpawn = false;
	gui.IgnoreGuiInset = true;
	const playerGui = getPlayerGui();
	if (playerGui !== undefined) gui.Parent = playerGui;
	return $tuple(gui, () => gui.Destroy());
}

function defaultGuiName(reg: UiReg): string {
	const cleaned = reg.id.gsub("[^%w_]+", "_")[0];
	return cleaned.size() > 0 ? cleaned : "RovyUiRoot";
}

function getPlayerGui(): PlayerGui | undefined {
	const [ok, players] = pcall(() => game.GetService("Players"));
	if (!ok || players === undefined) return undefined;
	const localPlayer = (players as Players).LocalPlayer;
	if (localPlayer === undefined) return undefined;
	const [findOk, direct] = pcall(() => localPlayer.FindFirstChildOfClass("PlayerGui"));
	if (findOk && direct !== undefined) return direct as PlayerGui;
	const [waitOk, waited] = pcall(() => localPlayer.WaitForChild("PlayerGui", 5));
	return waitOk ? waited as PlayerGui : undefined;
}

function track(node: ComponentNode, cleanup: Cleanup | LifecycleUnsubscribe): void {
	node.cleanups.push(cleanup as Cleanup);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeIs(value, "table");
}

export namespace JSX {
	export type Element = UiNode;
	export interface IntrinsicElements {
		[className: string]: InstanceProps;
	}
}

declare global {
	namespace JSX {
		type Element = UiNode;
		interface IntrinsicElements {
			[className: string]: InstanceProps;
		}
	}
}

export const __test = {
	reconcileNode,
	sameIdentity,
	renderComponent,
	markDirty,
	bindingMatches,
};
