# Rovy UI Components

Retained UI components are classes decorated with `@ui`. Only the component
passed to `app.mount(...)` is a root. Other `@ui` classes are normal components
that are rendered by parents with `child(...)`.

```ts
import { child, frame, textLabel, type Props, ui } from "@rovy/ui";

interface BadgeProps {
	readonly text: string;
}

@ui
class Badge {
	constructor(readonly props: Props<BadgeProps>) {}

	render() {
		return frame(
			{
				BackgroundColor3: Color3.fromRGB(39, 174, 96),
				Size: UDim2.fromOffset(120, 28),
			},
			textLabel({
				BackgroundTransparency: 1,
				Size: UDim2.fromScale(1, 1),
				Text: this.props.text,
			}),
		);
	}
}

@ui
class Root {
	render() {
		return child(Badge, { text: "Ready" });
	}
}
```

`Root` and `Badge` are both registered with `rovyUi.__ui(...)`. `Root` becomes a
root only if code calls `app.mount(Root)`. `Badge` is mounted because `Root`
returns `child(Badge, ...)`.

## Component ownership

Each mounted component has its own:

- class instance
- readonly props snapshot
- render params
- `static rerender` subscriptions
- child subtree
- cleanup list for trigger subscriptions

When a parent rerenders, child components are reconciled by identity. If identity
matches, the existing child instance is reused. If props changed, the child
rerenders with the new props.

## Props

Props are readonly snapshots. When parent props change, the existing component
instance is reused and re-rendered.

```ts
child(Badge, { text: "Equipped" }, { key: "status" });
```

Use `key` for lists and conditional branches:

```ts
@ui
class InventoryList {
	constructor(readonly props: Props<{ items: ReadonlyArray<Item> }>) {}

	render() {
		return frame(
			{},
			this.props.items.map((item) =>
				child(ItemRow, { item }, { key: item.id }),
			),
		);
	}
}
```

Without a key, fixed child positions use transformer-generated callsite ids.
Keys are still needed when siblings are created from arrays, sorted lists, or
conditionals that can move a component to a different position.

## Children through props

Rovy UI uses the React-style `children` prop for component children. In JSX,
nested component children are lowered into `props.children`.

```tsx
import { child, frame, fragment, textLabel, type Props, type UiChildren, ui } from "@rovy/ui";

interface PanelProps {
	readonly title: string;
	readonly children?: UiChildren;
}

@ui
class Panel {
	constructor(readonly props: Props<PanelProps>) {}

	render() {
		return frame({}, [
			textLabel({ Text: this.props.title }),
			fragment(this.props.children),
		]);
	}
}

@ui
class Root {
	render() {
		return (
			<Panel title="Loadout">
				<Badge key="sword" text="Sword" />
				<Badge key="shield" text="Shield" />
			</Panel>
		);
	}
}
```

That JSX compiles to the same component nodes as:

```ts
child(Panel, {
	title: "Loadout",
	children: [
		child(Badge, { text: "Sword" }, { key: "sword" }),
		child(Badge, { text: "Shield" }, { key: "shield" }),
	],
});
```

Use `fragment(this.props.children)` inside wrapper components when you want to
render passed children without adding an extra Roblox Instance.

## Render params

`render(...)` params use Rovy injection descriptors just like systems.

```ts
import { type Query } from "@rovy/core";

@ui
class UnitCount {
	render(units: Query<[Unit]>) {
		return textLabel({ Text: `${units.size()} units` });
	}
}
```

Render params do not subscribe automatically. Add a trigger when the component
should rerender from Rovy state changes.

```ts
@ui
class UnitCount {
	static rerender = [$queryTrigger<[Unit]>()];

	render(units: Query<[Unit]>) {
		return textLabel({ Text: `${units.size()} units` });
	}
}
```
