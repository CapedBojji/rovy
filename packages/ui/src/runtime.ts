import type { App, ParamDescriptor } from "@rovy/core";
import { resolveParams, type ResolveCtx } from "@rovy/core";

export interface WidgetMeta {
	readonly id: string;
	readonly name: string;
	readonly params?: ReadonlyArray<ParamDescriptor>;
}

export type WidgetFn = (...args: ReadonlyArray<unknown>) => unknown;
export interface WidgetReg {
	readonly fn: WidgetFn;
	readonly meta: WidgetMeta;
}

export interface Node {
	instance?: Instance;
	refs?: Record<string, Instance>;
	containerInstance?: Instance;
	effects: Map<string, EffectSlot>;
	states: Map<string, unknown>;
	children: Map<string, Node>;
	generation: number;
	eventCallback?: EventCallback;
}

export interface ContinueHandle {
	readonly frame: StackFrame;
}

export interface Context<T> {
	readonly name: string;
	readonly __type?: T;
}

export type EventCallback = (
	instance: Instance,
	event: string,
	handler: (...args: ReadonlyArray<unknown>) => void,
) => void;
export type StateSetter<T> = (nextValue: T | ((previous: T) => T)) => void;
export type EffectCleanup = () => void;

interface EffectSlot {
	lastDependencies?: Array<unknown>;
	cleanup?: EffectCleanup;
}

export interface StackFrame {
	node: Node;
	contextValues: Map<Context<unknown>, unknown>;
	childrenCount: number;
	effectCounts: Map<string, number>;
	stateCounts: Map<string, number>;
	instanceCounts: Map<string, number>;
	childCounts: Map<string, number>;
	discriminator?: string | number;
}

export const stack = new Array<StackFrame>();
export const registry = new Array<WidgetReg>();
let activeApp: App | undefined;

export function newNode(instance?: Instance): Node {
	return {
		instance,
		effects: new Map(),
		states: new Map(),
		children: new Map(),
		generation: 0,
	};
}

export function newFrame(node: Node): StackFrame {
	return {
		node,
		contextValues: new Map(),
		childrenCount: 0,
		effectCounts: new Map(),
		stateCounts: new Map(),
		instanceCounts: new Map(),
		childCounts: new Map(),
	};
}

function destroyNode(node: Node): void {
	node.instance?.Destroy();
	for (const [, effect] of node.effects) {
		effect.cleanup?.();
	}
	for (const [, child] of node.children) {
		destroyNode(child);
	}
	node.children.clear();
	node.effects.clear();
	node.states.clear();
}

export function currentFrame(): StackFrame {
	const frame = stack[stack.size() - 1];
	assert(frame !== undefined, "[rovy-ui] UI helpers can only run inside RovyUi.start/scope/widget");
	return frame;
}

function keyFor(kind: "state" | "effect" | "instance" | "child", baseKey: string): string {
	const frame = currentFrame();
	const counts =
		kind === "state"
			? frame.stateCounts
			: kind === "effect"
				? frame.effectCounts
				: kind === "instance"
					? frame.instanceCounts
					: frame.childCounts;
	const discriminator = frame.discriminator !== undefined ? tostring(frame.discriminator) : "";
	const scopedBase = `${discriminator}:${baseKey}`;
	const count = (counts.get(scopedBase) ?? 0) + 1;
	counts.set(scopedBase, count);
	return `${scopedBase}:${count}`;
}

function nearestFrameWithInstance(): StackFrame | undefined {
	for (let i = stack.size() - 1; i >= 0; i--) {
		const frame = stack[i];
		if (frame.node.containerInstance !== undefined || frame.node.instance !== undefined) return frame;
	}
	return undefined;
}

function invokeNoYield<T>(fn: () => T): T {
	const thread = coroutine.create(fn);
	const [success, result] = coroutine.resume(thread);
	assert(coroutine.status(thread) === "dead", "[rovy-ui] widget handler yielded; yielding is not allowed");
	if (!success) error(`[rovy-ui] ${tostring(result)}`, 2);
	return result as T;
}

function runChildScope<T>(key: string, fn: () => T): T {
	const parentFrame = currentFrame();
	const parent = parentFrame.node;
	const childKey = keyFor("child", key);
	let child = parent.children.get(childKey);
	if (child === undefined) {
		child = newNode();
		parent.children.set(childKey, child);
	}
	child.generation = parent.generation;
	stack.push(newFrame(child));
	try {
		return invokeNoYield(fn);
	} finally {
		stack.pop();
		for (const [staleKey, staleChild] of child.children) {
			if (staleChild.generation !== child.generation) {
				destroyNode(staleChild);
				child.children.delete(staleKey);
			}
		}
	}
}

function depsChanged(previous: Array<unknown> | undefined, deps: Array<unknown>): boolean {
	if (previous === undefined) return true;
	if (previous.size() !== deps.size()) return true;
	for (let i = 0; i < deps.size(); i++) {
		if (previous[i] !== deps[i]) return true;
	}
	return false;
}

function createContextInternal<T>(name: string): Context<T> {
	return { name };
}

export function createContext<T>(name: string): Context<T> {
	return createContextInternal<T>(name);
}

export function useContext<T>(context: Context<T>): T | undefined {
	for (let i = stack.size() - 1; i >= 0; i--) {
		const value = stack[i].contextValues.get(context as Context<unknown>);
		if (value !== undefined) return value as T;
	}
	return undefined;
}

export function provideContext<T>(context: Context<T>, value: T): void {
	currentFrame().contextValues.set(context as Context<unknown>, value);
}

export function newRoot(rootInstance: Instance): Node {
	return newNode(rootInstance);
}

export { newRoot as new };

export function beginFrame<TArgs extends Array<unknown>>(
	rootNode: Node,
	callback: (...args: TArgs) => void,
	...args: TArgs
): ContinueHandle {
	assert(stack.size() === 0, "Runtime.start cannot be called while Runtime.start is already running");
	rootNode.generation = rootNode.generation === 0 ? 1 : 0;
	stack.push(newFrame(rootNode));
	__scope("root", () => callback(...args));
	const frame = stack.pop() as StackFrame;
	return { frame };
}

export function finishFrame(rootNode: Node): void {
	for (const [key, child] of rootNode.children) {
		if (child.generation !== rootNode.generation) {
			destroyNode(child);
			rootNode.children.delete(key);
		}
	}
}

export function start<TArgs extends Array<unknown>>(
	rootNode: Node,
	callback: (...args: TArgs) => void,
	...args: TArgs
): void {
	beginFrame(rootNode, callback, ...args);
	finishFrame(rootNode);
}

export function continueFrame<TArgs extends Array<unknown>>(
	handle: ContinueHandle,
	callback: (...args: TArgs) => void,
	...args: TArgs
): void {
	assert(stack.size() === 0, "Runtime.continueFrame cannot be called while Runtime.start is already running");
	stack.push(handle.frame);
	__scope("root", () => callback(...args));
	stack.pop();
}

export function __scope<T>(key: string, fn: () => T): T {
	return runChildScope(key, fn);
}

export function scope<T>(fn: () => T): T {
	error("[rovy-ui] scope(...) must be lowered by rovy-transformer");
}

export function widget<T extends (...args: Array<never>) => unknown>(fn: T, key = "manual-widget"): T {
	return ((...args: Array<never>) => __scope(key, () => fn(...args))) as T;
}

export function __useState<T>(key: string, initialValue: T | (() => T)): [T, StateSetter<T>] {
	const frame = currentFrame();
	const stateKey = keyFor("state", key);
	if (!frame.node.states.has(stateKey)) {
		frame.node.states.set(stateKey, typeIs(initialValue, "function") ? (initialValue as () => T)() : initialValue);
	}
	const setter = (nextValue: T | ((previous: T) => T)): void => {
		const previous = frame.node.states.get(stateKey) as T;
		frame.node.states.set(
			stateKey,
			typeIs(nextValue, "function") ? (nextValue as (previous: T) => T)(previous) : nextValue,
		);
	};
	return [frame.node.states.get(stateKey) as T, setter];
}

export function useState<T>(_initialValue: T | (() => T)): [T, StateSetter<T>] {
	error("[rovy-ui] useState(...) must be lowered by rovy-transformer");
}

export function __useEffect(key: string, callback: () => void | EffectCleanup, ...dependencies: Array<unknown>): void {
	const effectKey = keyFor("effect", key);
	const effects = currentFrame().node.effects;
	const existing = effects.get(effectKey);
	if (!depsChanged(existing?.lastDependencies, dependencies)) return;
	existing?.cleanup?.();
	const cleanup = callback();
	effects.set(effectKey, {
		lastDependencies: dependencies,
		cleanup: typeIs(cleanup, "function") ? cleanup : undefined,
	});
}

export function useEffect(_callback: () => void | EffectCleanup, ..._dependencies: Array<unknown>): void {
	error("[rovy-ui] useEffect(...) must be lowered by rovy-transformer");
}

export function __useInstance<T extends object = Record<string, Instance>>(
	key: string,
	creator: (ref: Record<string, Instance>) => Instance | [Instance | undefined, Instance?],
): T {
	const nodeKey = keyFor("instance", key);
	const parentFrame = nearestFrameWithInstance();
	assert(parentFrame !== undefined, "[rovy-ui] useInstance requires a parent root instance");
	let child = currentFrame().node.children.get(nodeKey);
	if (child === undefined) {
		child = newNode();
		currentFrame().node.children.set(nodeKey, child);
	}
	child.generation = currentFrame().node.generation;
	if (child.instance === undefined) {
		child.refs = {};
		const result = creator(child.refs);
		const instance = (typeIs(result, "table") && (result as Array<unknown>)[0] !== undefined
			? (result as Array<unknown>)[0]
			: result) as Instance | undefined;
		const container = (typeIs(result, "table") ? (result as Array<unknown>)[1] : undefined) as Instance | undefined;
		if (instance !== undefined) {
			instance.Parent = parentFrame.node.containerInstance ?? parentFrame.node.instance;
			child.instance = instance;
		}
		if (container !== undefined) child.containerInstance = container;
	}
	if (currentFrame().node.instance === undefined && child.instance !== undefined) {
		currentFrame().node.instance = child.instance;
	}
	if (currentFrame().node.containerInstance === undefined && child.containerInstance !== undefined) {
		currentFrame().node.containerInstance = child.containerInstance;
	}
	if (child.instance !== undefined && (child.instance as Instance & { LayoutOrder?: number }).LayoutOrder !== undefined) {
		parentFrame.childrenCount++;
		(child.instance as Instance & { LayoutOrder: number }).LayoutOrder = parentFrame.childrenCount;
	}
	return (child.refs ?? {}) as T;
}

export function useInstance<T extends object = Record<string, Instance>>(
	_creator: (ref: Record<string, Instance>) => Instance | [Instance | undefined, Instance?],
): T {
	error("[rovy-ui] useInstance(...) must be lowered by rovy-transformer");
}

export function useKey(key: string | number): void {
	currentFrame().discriminator = key;
}

export function useRootInstance(): Instance | undefined {
	return stack[0]?.node.instance;
}

export function setEventCallback(callback: EventCallback): void {
	const root = stack[0];
	assert(root !== undefined, "[rovy-ui] setEventCallback requires an active frame");
	root.node.eventCallback = callback;
}

export function useEventCallback(): EventCallback | undefined {
	return stack[0]?.node.eventCallback;
}

export function withApp<T>(app: App, fn: () => T): T {
	const previous = activeApp;
	activeApp = app;
	try {
		return fn();
	} finally {
		activeApp = previous;
	}
}

function createWidgetResolveCtx(): ResolveCtx {
	assert(activeApp !== undefined, "[rovy-ui] widget injected params require RovyUi.withApp(app, fn)");
	return activeApp.createResolveCtx();
}

function invokeWidget(fn: WidgetFn, meta: WidgetMeta, args: ReadonlyArray<unknown>): unknown {
	const params = meta.params ?? [];
	if (params.size() === 0) return fn(...args);
	const injected = resolveParams(params, createWidgetResolveCtx());
	const allArgs = new Array<defined>();
	for (const value of injected) allArgs.push(value as defined);
	for (const value of args) allArgs.push(value as defined);
	return fn(...(allArgs as unknown as Array<unknown>));
}

export function __widget<T extends WidgetFn>(fn: T, meta: WidgetMeta): T {
	registry.push({ fn, meta });
	return ((...args: ReadonlyArray<unknown>) => __scope(meta.id, () => invokeWidget(fn, meta, args))) as T;
}

export function __callWidget<T>(
	key: string,
	widgetFn: (...args: unknown[]) => T,
	...args: unknown[]
): T {
	return __scope(key, () => widgetFn(...args));
}

export function __reset(): void {
	for (const frame of stack) destroyNode(frame.node);
	while (stack.size() > 0) stack.pop();
	while (registry.size() > 0) registry.pop();
	activeApp = undefined;
}
