# Rovy UI API Reference

## Decorator

```ts
function ui(ctor: Ctor): void;
```

Marks a retained UI component class. Classes must implement `render(...)`.

## Mounting

```ts
interface UiMountOptions<TProps extends object = {}> {
	readonly target?: Instance;
	readonly name?: string;
	readonly props?: TProps;
}

interface UiHandle {
	readonly destroy: () => void;
}

function mountUi<TProps extends object = {}>(
	app: App,
	rootCtor: UiComponentCtor<TProps>,
	options?: UiMountOptions<TProps>,
): UiHandle;

function unmountUi(handle: UiHandle): void;
```

Prefer `app.mount(Root, target?, options?)` before `app.start()` for normal app
startup. Use `mountUi(...)` only after the app is already started.

## Nodes

```ts
type UiChild = UiNode | false | undefined;
type UiChildren = UiChild | ReadonlyArray<UiChild>;
```

Factories return `UiNode` values. Components may return a node, `false`, or
`undefined`.

## Components and props

```ts
type Props<T extends object = {}> = Readonly<T>;

interface UiComponent {
	render: (...args: never[]) => UiChild;
}

type UiComponentCtor<TProps extends object = {}> =
	new (props: Props<TProps>) => UiComponent;
```

## Composition

```ts
function child<TProps extends object>(
	ctor: UiComponentCtor<TProps>,
	props?: TProps,
	options?: { readonly key?: string | number },
): UiNode;

function fragment(children?: UiChildren): UiNode;
function native(className: string, props?: Record<string, unknown>, children?: UiChildren): UiNode;
```

## Triggers

Use triggers in a component's static `rerender` array.

```ts
$queryTrigger<[Health]>({ on: ["added", "changed", "removed"] });
$componentTrigger(Health, { entity: $prop<Entity>("entity"), on: ["changed"] });
$resourceTrigger(Theme);
$eventTrigger(InventoryChanged);
$relationTrigger(EquippedBy, { source: $prop<Entity>("item") });
$lifecycleTrigger("despawned");
$propsTrigger();
```

Triggers are transformer-backed. Do not hand-author the runtime descriptor shape.
