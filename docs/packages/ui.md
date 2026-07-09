# Rovy UI

`@rovy/ui` is Rovy's retained, class-based Roblox UI package. Use it when you
want UI components to live inside the same decorator and injection model as the
rest of your game code.

An `@ui` class is a component, not necessarily a root. The root is just the one
component you pass to `app.mount(...)` or `mountUi(...)`. Most `@ui` classes are
ordinary child components returned from another component's `render(...)`.

It is separate from both [`@rovy/vide`](/packages/vide) and
[`@rovy/imgui`](/packages/imgui):

- `@rovy/ui` builds persistent Roblox Instance trees from nested `@ui`
  components and native Roblox factories.
- `@rovy/vide` mounts reactive Vide views.
- `@rovy/imgui` renders immediate-mode debug and tool widgets.

## Install

```sh
npm i @rovy/ui
```

The normal `rovy-transformer` setup is required because `@ui` classes and
trigger helpers are lowered at compile time.

## Minimal root example

```ts
import { App } from "@rovy/core";
import { frame, textLabel, ui } from "@rovy/ui";

@ui
class RootHud {
	render() {
		return frame(
			{
				Name: "RootHud",
				BackgroundColor3: Color3.fromRGB(24, 28, 35),
				Size: UDim2.fromOffset(280, 72),
			},
			textLabel({
				BackgroundTransparency: 1,
				Size: UDim2.fromScale(1, 1),
				Text: "Rovy UI",
				TextColor3: Color3.fromRGB(245, 247, 250),
			}),
		);
	}
}

const app = new App();
app.mount(RootHud);
app.start();
```

`app.mount(...)` must be called before `app.start()`. `@rovy/ui` consumes the
queued mount request after the app finishes startup, so render params can use the
same injection descriptors as systems and other Rovy runtime classes.

The mounted class is the root for that mount. It can return native Instances
directly, or it can return child `@ui` components.

## Authoring model

- Mark class components with `@ui`.
- Implement `render(...)` and return a `UiNode`, `false`, or `undefined`.
- Build native Roblox instances with factories such as `frame`, `textLabel`,
  `textButton`, `uiListLayout`, `uiPadding`, and `uiCorner`.
- Compose components with `child(Component, props)`.
- Use `static rerender = [...]` to subscribe a component to Rovy changes. Render
  params read data; triggers decide when that render should run again.

## Components inside components

Use `child(Component, props?, options?)` to render one `@ui` component inside
another. The child class must also be decorated with `@ui`, because the runtime
looks up transformer-generated metadata for every component class it mounts.

```ts
import { child, frame, textLabel, type Props, ui, uiListLayout } from "@rovy/ui";

interface StatRowProps {
	readonly label: string;
	readonly value: string;
}

@ui
class StatRow {
	constructor(readonly props: Props<StatRowProps>) {}

	render() {
		return frame(
			{
				AutomaticSize: Enum.AutomaticSize.Y,
				BackgroundTransparency: 1,
				Size: UDim2.fromScale(1, 0),
			},
			[
				textLabel({
					BackgroundTransparency: 1,
					Size: UDim2.fromScale(0.5, 0),
					Text: this.props.label,
					TextXAlignment: Enum.TextXAlignment.Left,
				}),
				textLabel({
					BackgroundTransparency: 1,
					Size: UDim2.fromScale(0.5, 0),
					Text: this.props.value,
					TextXAlignment: Enum.TextXAlignment.Right,
				}),
			],
		);
	}
}

@ui
class StatsPanel {
	render() {
		return frame({}, [
			uiListLayout({ SortOrder: Enum.SortOrder.LayoutOrder }),
			child(StatRow, { label: "Wave", value: "4" }, { key: "wave" }),
			child(StatRow, { label: "Coins", value: "128" }, { key: "coins" }),
		]);
	}
}
```

Each `child(...)` call creates or reconciles a component node. When `StatsPanel`
rerenders, `@rovy/ui` compares the old child node with the new child node:

- same component class + same `key` or callsite: reuse the existing `StatRow`
  instance, update its props, and rerender that child if props changed.
- different component class, different `key`, or different callsite: destroy the
  old child subtree and mount a new one.

Use `key` when rendering repeated or conditionally reordered children. Fixed
children can rely on transformer-generated callsite identity.

```ts
import { resource, type Res } from "@rovy/core";
import { $resourceTrigger, textLabel, ui } from "@rovy/ui";

@resource
class Score {
	constructor(public value = 0) {}
}

@ui
class ScoreLabel {
	static rerender = [$resourceTrigger(Score)];

	render(score: Res<Score>) {
		return textLabel({
			BackgroundTransparency: 1,
			Text: `Score: ${score.value}`,
		});
	}
}
```

## Rerender model

Mounting renders each component once. After that, `@rovy/ui` only rerenders a
component when one of three things happens:

1. Its parent passes different props.
2. One of its `static rerender` triggers marks it dirty.
3. It is remounted because its key, callsite, component class, or native class
   identity changed.

Dirty components are batched through `task.defer(...)` and rerendered by
reconciling their returned node against the existing Roblox Instance tree. A
trigger does not recreate the whole root; it rerenders the component that owns
the trigger and then patches that subtree.

See [Rerender Triggers](/packages/ui/rerender-triggers) for the exact trigger
mechanics and [Compiled Output](/packages/ui/compiled-output) for the emitted
Luau shape.

## Mounting targets

If no target is supplied, `@rovy/ui` creates a `ScreenGui` under
`Players.LocalPlayer.PlayerGui` when available.

```ts
app.mount(RootHud, undefined, { name: "GameHud" });
```

Pass an explicit target when embedding inside an existing `ScreenGui`, `Frame`,
or test harness container.

```ts
app.mount(RootHud, existingFrame, {
	props: { title: "Inventory" },
});
```

## Next steps

- [Getting Started](/packages/ui/getting-started)
- [JSX](/packages/ui/jsx)
- [Props And Children](/packages/ui/props-and-children)
- [Events And Refs](/packages/ui/events-and-refs)
- [Reconciliation](/packages/ui/reconciliation)
- [Render Injection](/packages/ui/render-injection)
- [Rerender Triggers](/packages/ui/rerender-triggers)
- [Compiled Output](/packages/ui/compiled-output)
- [Built-in Factories](/packages/ui/built-in-widgets)
- [Styling](/packages/ui/styling)
- [Components](/packages/ui/custom-widgets)
- [API Reference](/packages/ui/api-reference)
