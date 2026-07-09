# Rovy UI API Reference

## Decorator

```ts
function ui(ctor: Ctor): void;
```

Marks a retained UI component class. Classes must implement `render(...)`.
Decorating a class does not mount it. A decorated class becomes a root only when
passed to `app.mount(...)` or `mountUi(...)`; otherwise it is a normal child
component used through `child(...)`.

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
startup. Mount only root components this way. Nested components are returned
from parent render methods with `child(Component, props, options)`.

Use `mountUi(...)` only after the app is already started.

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

`child(...)` mounts or reconciles another `@ui` component under the current
component. The child class must be decorated with `@ui`; otherwise the runtime
throws because it has no transformer metadata for that class.

Component children are passed through ordinary props, usually as
`children?: UiChildren`. JSX lowers nested children into that prop:

```tsx
<Panel title="Loadout">
	<Badge key="sword" text="Sword" />
</Panel>
```

Equivalent factory form:

```ts
child(Panel, {
	title: "Loadout",
	children: child(Badge, { text: "Sword" }, { key: "sword" }),
});
```

`fragment(...)` groups children without creating a Roblox Instance.

`native(...)` creates a Roblox Instance node. Factory helpers such as `frame` and
`textLabel` call `native(...)` with the matching class name.

## Triggers

Use triggers in a component's static `rerender` array. These helpers are
compile-time authoring macros: the transformer replaces them with runtime
descriptors stored in `rovyUi.__ui(...)` metadata.

```ts
$queryTrigger<[Health]>({ on: ["added", "changed", "removed"] });
$componentTrigger(Health, { entity: $prop<Entity>("entity"), on: ["changed"] });
$resourceTrigger(Theme);
$eventTrigger(InventoryChanged);
$relationTrigger(EquippedBy, { source: $prop<Entity>("item") });
$lifecycleTrigger("entity_despawned");
$propsTrigger();
```

Triggers are transformer-backed. Do not hand-author the runtime descriptor shape.
For exact runtime behavior, see [Rerender Triggers](/packages/ui/rerender-triggers).

## Render injection

`render(...)` params are lowered independently from triggers. A component can
inject `Res<T>`, `Query<...>`, `EventReader<E>`, `World`, `Commands`, `Local<T>`,
and other normal Rovy param types to read data during render. Those params do
not install subscriptions by themselves.

See [Render Injection](/packages/ui/render-injection).
