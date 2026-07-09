# Rovy UI

`@rovy/ui` is Rovy's retained, class-based Roblox UI package. Use it when you
want UI components to live inside the same decorator and injection model as the
rest of your game code.

It is separate from both [`@rovy/vide`](/packages/vide) and
[`@rovy/imgui`](/packages/imgui):

- `@rovy/ui` builds persistent Roblox Instance trees from `@ui` classes.
- `@rovy/vide` mounts reactive Vide views.
- `@rovy/imgui` renders immediate-mode debug and tool widgets.

## Install

```sh
npm i @rovy/ui
```

The normal `rovy-transformer` setup is required because `@ui` classes and
trigger helpers are lowered at compile time.

## Minimal example

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

## Authoring model

- Mark class components with `@ui`.
- Implement `render(...)` and return a `UiNode`, `false`, or `undefined`.
- Build native Roblox instances with factories such as `frame`, `textLabel`,
  `textButton`, `uiListLayout`, `uiPadding`, and `uiCorner`.
- Compose components with `child(Component, props)`.
- Use `static rerender = [...]` to subscribe a component to Rovy changes.

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
- [Built-in Factories](/packages/ui/built-in-widgets)
- [Styling](/packages/ui/styling)
- [Custom Components](/packages/ui/custom-widgets)
- [API Reference](/packages/ui/api-reference)
