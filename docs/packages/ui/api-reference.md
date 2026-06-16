# Rovy UI API Reference

This page lists the main public exports from `@rovy/ui`.

## Runtime

```ts
const root = RovyUi.new(rootInstance, options?);
RovyUi.start(root, render);
```

```ts
new(rootInstance: Instance, options?: NewRootOptions): Node
start(node: Node, callback: (...args) => void, ...args): void
beginFrame(node: Node, callback: (...args) => void, ...args): ContinueHandle
continueFrame(handle: ContinueHandle, callback: (...args) => void, ...args): void
finishFrame(node: Node): void
scope(fn: () => void): void
```

`NewRootOptions` supports an injected `inputService`, which is especially useful in UI Labs and plugin viewports.

## State And Instance Helpers

```ts
useState<T>(initialValue: T | (() => T)): [T, StateSetter<T>]
useEffect(callback: () => void | (() => void), ...dependencies: defined[]): void
useInstance<T extends object>(
	creator: (ref: Record<string, Instance>) => Instance | [Instance | undefined, Instance?]
): T
useKey(discriminator: string | number): void
```

State is scoped to the widget callsite. When the widget node is pruned, its state and instances are destroyed.

## Context

```ts
createContext<T>(name: string): Context<T>
provideContext<T>(context: Context<T>, value: T): void
useContext<T>(context: Context<T>): T | undefined
```

Contexts walk the current frame stack and return the nearest provided value.

## Style

```ts
useStyle(): Style
getActiveStyle(): Style
setStyle(patch: Partial<Style>): void
StyleScope(options: StyleScopeOptions, children: () => void): void
withStyleScope(options: StyleScopeOptions, children: () => void): void
```

Prefer `StyleScope` over raw `setStyle`, because it restores the previous style after the child scope finishes.

## Instance Creation

```ts
create<T extends keyof CreatableInstances>(
	className: T,
	props?: Record<string | number, unknown>
): CreatableInstances[T]
```

The helper creates an Instance, applies properties, connects signal callbacks, stores refs, and parents numeric child entries.

## Input Adapter

```ts
createRovyInputServiceFromSignals(inputSignals: RovyInputSignals): RovyInputService
```

Use this when a host provides signals instead of Roblox's default `UserInputService`.

## Built-in Widgets

See [Built-in Widgets](/packages/ui/built-in-widgets) for signatures and examples.

Common exports include:

```ts
window
childWindow
modal
popup
portal
row
button
checkbox
toggle
radioButton
selectableLabel
clickableLabel
label
heading
separator
space
progressBar
slider
dragValue
input
comboBox
table
tableRow
tableCell
editableImage
EditableImageBuffer
demoWindow
curveEditor
curvePath
viewportFrame
viewportItem
sampleBezierCurve
```

## Curve Editor Types

See [Curve Editor](/packages/ui/curve-editor) for detailed examples.

```ts
type CurveSegmentKind = "L" | "Q" | "C";

type CurvePathCommand =
	| { kind: "M"; point: CurveCanvasPoint }
	| { kind: "L"; point: CurveCanvasPoint }
	| { kind: "Q"; control: CurveCanvasPoint; point: CurveCanvasPoint }
	| { kind: "C"; control1: CurveCanvasPoint; control2: CurveCanvasPoint; point: CurveCanvasPoint }
	| { kind: "Z" };
```

## Viewport Frame Types

```ts
viewportFrame(options: ViewportFrameOptions, children: () => void): ViewportFrameHandle
viewportItem(options: ViewportItemOptions): ViewportItemHandle
```

`viewportItem` clones the provided source instance into the parent viewport. In dynamic loops, call `useKey` with a stable item id before `viewportItem`.

## Internal Transformer Hooks

The runtime also exports internal helpers like `__widget`, `__scope`, `__callWidget`, `__useState`, `__useEffect`, and `__useInstance`. Consumer code should not hand-call these. They are transformer targets.
