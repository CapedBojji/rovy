# Rovy UI Getting Started

This page starts from a normal Rovy app, mounts one retained UI root, and then
breaks that root into child `@ui` components.

## 1. Install the package

```sh
npm i @rovy/ui
```

Keep `rovy-transformer` registered in `tsconfig.json`:

```json
{
	"compilerOptions": {
		"plugins": [
			{
				"transform": "rovy-transformer"
			}
		]
	}
}
```

## 2. Create a UI root

```ts
import { frame, textLabel, ui, uiCorner, uiPadding } from "@rovy/ui";

@ui
export class TemplateHud {
	render() {
		return frame(
			{
				Name: "TemplateHud",
				AnchorPoint: new Vector2(0.5, 0),
				BackgroundColor3: Color3.fromRGB(24, 28, 35),
				BorderSizePixel: 0,
				Position: UDim2.fromScale(0.5, 0.04),
				Size: UDim2.fromOffset(280, 72),
			},
			[
				uiCorner({ CornerRadius: new UDim(0, 8) }),
				uiPadding({
					PaddingBottom: new UDim(0, 10),
					PaddingLeft: new UDim(0, 14),
					PaddingRight: new UDim(0, 14),
					PaddingTop: new UDim(0, 10),
				}),
				textLabel({
					BackgroundTransparency: 1,
					FontFace: Font.fromEnum(Enum.Font.GothamBold),
					Size: UDim2.fromScale(1, 1),
					Text: "Rovy UI",
					TextColor3: Color3.fromRGB(245, 247, 250),
					TextSize: 18,
					TextXAlignment: Enum.TextXAlignment.Left,
				}),
			],
		);
	}
}
```

This class is a root only because the app will mount it. The `@ui` decorator
does not make a component global or root-owned by itself.

## 3. Queue the root before startup

```ts
import { App } from "@rovy/core";
import { TemplateHud } from "./ui/template-hud";

const app = new App();
app.mount(TemplateHud, undefined, { name: "TemplateHudGui" });
app.start();
```

`app.mount(...)` queues the root before startup. `@rovy/ui` mounts the root after
Rovy finalizes registrations and app extensions.

## 4. Add child components

Most UI should be split into smaller `@ui` components and composed with
`child(...)` or JSX.

```ts
import { child, frame, textLabel, type Props, ui } from "@rovy/ui";

interface HudLabelProps {
	readonly title: string;
	readonly subtitle: string;
}

@ui
class HudLabel {
	constructor(readonly props: Props<HudLabelProps>) {}

	render() {
		return frame(
			{
				BackgroundTransparency: 1,
				Size: UDim2.fromScale(1, 1),
			},
			[
				textLabel({
					BackgroundTransparency: 1,
					Text: this.props.title,
				}),
				textLabel({
					BackgroundTransparency: 1,
					Text: this.props.subtitle,
				}),
			],
		);
	}
}

@ui
export class TemplateHud {
	render() {
		return frame(
			{
				Name: "TemplateHud",
				Size: UDim2.fromOffset(280, 72),
			},
			child(HudLabel, {
				title: "Rovy UI",
				subtitle: "Blank ECS game scaffold",
			}),
		);
	}
}
```

`HudLabel` is not mounted directly. It is still registered by the transformer,
and `TemplateHud` mounts it as a child when its render tree is reconciled.

For wrapper components, use the React-style `children` prop. JSX children are
lowered into that prop:

```tsx
import { frame, fragment, type Props, type UiChildren, ui } from "@rovy/ui";

interface HudPanelProps {
	readonly children?: UiChildren;
}

@ui
class HudPanel {
	constructor(readonly props: Props<HudPanelProps>) {}

	render() {
		return frame(
			{
				BackgroundColor3: Color3.fromRGB(24, 28, 35),
				Size: UDim2.fromOffset(280, 72),
			},
			fragment(this.props.children),
		);
	}
}

@ui
export class TemplateHud {
	render() {
		return (
			<HudPanel>
				<HudLabel title="Rovy UI" subtitle="Blank ECS game scaffold" />
			</HudPanel>
		);
	}
}
```

The non-JSX form is explicit but equivalent:

```ts
child(HudPanel, {
	children: child(HudLabel, {
		title: "Rovy UI",
		subtitle: "Blank ECS game scaffold",
	}),
});
```

## 5. Rerender from Rovy state

Use render params for data and `static rerender` for subscriptions.

```ts
import { resource, type Res } from "@rovy/core";
import { $resourceTrigger, textLabel, ui } from "@rovy/ui";

@resource
class MatchState {
	constructor(public wave = 1) {}
}

@ui
class WaveLabel {
	static rerender = [$resourceTrigger(MatchState)];

	render(state: Res<MatchState>) {
		return textLabel({
			BackgroundTransparency: 1,
			Text: `Wave ${state.wave}`,
		});
	}
}
```

You can use stateful child components the same way:

```ts
@ui
class HudBody {
	render(state: Res<MatchState>) {
		return frame({}, [
			textLabel({ Text: "Match" }),
			child(WaveLabel, {}, { key: "wave" }),
		]);
	}
}
```

Props rerender children when the parent passes a changed value. Rovy triggers
rerender the component that owns the trigger.
