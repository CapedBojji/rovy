# Rovy UI Props And Children

Props are how parent components pass data to child `@ui` components. Children
are not a separate runtime concept; they are normally passed as a
`children?: UiChildren` prop, matching the React mental model.

## Declaring props

Use `Props<T>` for constructor props:

```ts
import { textLabel, type Props, ui } from "@rovy/ui";

interface BadgeProps {
	readonly text: string;
	readonly tone?: "good" | "bad";
}

@ui
class Badge {
	constructor(readonly props: Props<BadgeProps>) {}

	render() {
		return textLabel({
			BackgroundTransparency: 1,
			Text: this.props.text,
			TextColor3: this.props.tone === "bad"
				? Color3.fromRGB(255, 115, 115)
				: Color3.fromRGB(180, 235, 180),
		});
	}
}
```

Props are readonly snapshots. Mutating `this.props` is not the update model.
Parents pass new props when they rerender.

## Passing props with `child(...)`

```ts
@ui
class Root {
	render() {
		return child(Badge, {
			text: "Ready",
			tone: "good",
		});
	}
}
```

`child(Badge, props)` creates a component node. If the same `Badge` node is
reused on the next parent render and props changed, `@rovy/ui` updates the
child's props and rerenders that child.

## Passing props with JSX

```tsx
@ui
class Root {
	render() {
		return <Badge text="Ready" tone="good" />;
	}
}
```

This lowers to the same component node as:

```ts
child(Badge, { text: "Ready", tone: "good" });
```

## Passing children

Declare children explicitly:

```ts
import { fragment, type Props, type UiChildren, ui } from "@rovy/ui";

interface PanelProps {
	readonly title: string;
	readonly children?: UiChildren;
}

@ui
class Panel {
	constructor(readonly props: Props<PanelProps>) {}

	render() {
		return frame(
			{ Name: "Panel" },
			[
				textLabel({ Text: this.props.title }),
				fragment(this.props.children),
			],
		);
	}
}
```

Then pass children with JSX:

```tsx
<Panel title="Loadout">
	<Badge key="sword" text="Sword" />
	<Badge key="shield" text="Shield" />
</Panel>
```

The JSX above lowers to:

```ts
child(Panel, {
	title: "Loadout",
	children: [
		child(Badge, { text: "Sword" }, { key: "sword" }),
		child(Badge, { text: "Shield" }, { key: "shield" }),
	],
});
```

Use `fragment(this.props.children)` when the wrapper should render its children
without adding another Roblox Instance. Use a native container such as
`frame({}, this.props.children)` when the wrapper should own a Roblox Instance.

## Prop changes and rerendering

Parent-driven prop changes rerender the child:

```ts
@ui
class CounterText {
	constructor(readonly props: Props<{ value: number }>) {}

	render() {
		return textLabel({ Text: tostring(this.props.value) });
	}
}

@ui
class CounterPanel {
	static rerender = [$resourceTrigger(CounterState)];

	render(state: Res<CounterState>) {
		return child(CounterText, { value: state.value });
	}
}
```

When `CounterState` changes, `CounterPanel` rerenders. If `value` changed, the
existing `CounterText` instance is reused and rerendered with new props.

If props are identical by reference/value comparison, the child is not rerendered
just because the parent rerendered.

## Keys with props

Use keys for repeated children:

```tsx
<frame>
	{items.map((item) => (
		<ItemRow key={item.id} item={item} />
	))}
</frame>
```

`key` is not passed as a prop. It is used for reconciliation identity. The child
receives `props.item`, not `props.key`.
