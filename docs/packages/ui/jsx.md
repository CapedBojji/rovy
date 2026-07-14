# Rovy UI JSX

Yes: `@rovy/ui` supports JSX.

JSX is syntax sugar over the same retained UI nodes as `frame(...)`,
`textLabel(...)`, `child(...)`, `native(...)`, and `fragment(...)`. The
transformer lowers JSX before roblox-ts emits Luau, and the runtime only sees
ordinary `UiNode` data.

## Setup

Enable JSX in `tsconfig.json`:

```json
{
	"compilerOptions": {
		"jsx": "react",
		"jsxFactory": "RovyUi.jsx",
		"jsxFragmentFactory": "RovyUi.Fragment",
		"plugins": [
			{
				"transform": "rovy-transformer"
			}
		]
	}
}
```

Then import the default JSX helper in files that use JSX:

```tsx
import RovyUi, { ui } from "@rovy/ui";
```

The default import name must match `jsxFactory`. If your config uses
`"jsxFactory": "RovyUi.jsx"`, import the default as `RovyUi`.

## Native Roblox tags

Lower-case and camel-case JSX tags create native Roblox Instances. These tags
map to the same built-in factories:

| JSX tag | Roblox class |
| --- | --- |
| `<screenGui>` | `ScreenGui` |
| `<billboardGui>` | `BillboardGui` |
| `<surfaceGui>` | `SurfaceGui` |
| `<frame>` | `Frame` |
| `<textLabel>` | `TextLabel` |
| `<textButton>` | `TextButton` |
| `<imageLabel>` | `ImageLabel` |
| `<imageButton>` | `ImageButton` |
| `<scrollingFrame>` | `ScrollingFrame` |
| `<canvasGroup>` | `CanvasGroup` |
| `<textBox>` | `TextBox` |
| `<viewportFrame>` | `ViewportFrame` |
| `<uiListLayout>` | `UIListLayout` |
| `<uiGridLayout>` | `UIGridLayout` |
| `<uiPadding>` | `UIPadding` |
| `<uiCorner>` | `UICorner` |
| `<uiStroke>` | `UIStroke` |
| `<uiScale>` | `UIScale` |
| `<uiAspectRatioConstraint>` | `UIAspectRatioConstraint` |
| `<uiSizeConstraint>` | `UISizeConstraint` |

Use these exact lower-case/camel-case tags. Do not write `<Frame>` or
`<TextLabel>` for native Instances, because uppercase JSX tags are interpreted
as custom `@ui` components.

There is no JSX alias for every Roblox class. For unsupported classes such as
`UIGradient`, use `native("UIGradient", props)` in an expression.

Portals use the `portal(...)` factory rather than a JSX tag. JSX nodes can be
passed as the portal child:

```tsx
return portal(head, (
	<billboardGui Adornee={head} Size={UDim2.fromOffset(140, 36)}>
		<textLabel Text="Unit" Size={UDim2.fromScale(1, 1)} />
	</billboardGui>
), { key: entity });
```

Example:

```tsx
import RovyUi, { ui } from "@rovy/ui";

@ui
class HudRoot {
	render() {
		return (
			<frame
				Name="HudRoot"
				AnchorPoint={new Vector2(0.5, 0)}
				BackgroundColor3={Color3.fromRGB(24, 28, 35)}
				BorderSizePixel={0}
				Position={UDim2.fromScale(0.5, 0.04)}
				Size={UDim2.fromOffset(300, 90)}
			>
				<uiCorner CornerRadius={new UDim(0, 8)} />
				<uiPadding
					PaddingBottom={new UDim(0, 10)}
					PaddingLeft={new UDim(0, 14)}
					PaddingRight={new UDim(0, 14)}
					PaddingTop={new UDim(0, 10)}
				/>
				<uiListLayout
					Padding={new UDim(0, 4)}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				<textLabel
					BackgroundTransparency={1}
					FontFace={Font.fromEnum(Enum.Font.GothamBold)}
					LayoutOrder={1}
					Size={UDim2.fromScale(1, 0)}
					Text="Rovy UI"
					TextColor3={Color3.fromRGB(245, 247, 250)}
					TextSize={18}
					TextXAlignment={Enum.TextXAlignment.Left}
				/>
			</frame>
		);
	}
}
```

The example above lowers to calls shaped like:

```ts
RovyUi.native("Frame", props, [
	RovyUi.native("UICorner", props, []),
	RovyUi.native("UIPadding", props, []),
	RovyUi.native("UIListLayout", props, []),
	RovyUi.native("TextLabel", props, []),
]);
```

## Custom `@ui` components

Uppercase JSX tags are custom components. The tag must refer to an `@ui` class.

```tsx
import RovyUi, { frame, fragment, textLabel, type Props, type UiChildren, ui } from "@rovy/ui";

interface PanelProps {
	readonly title: string;
	readonly children?: UiChildren;
}

@ui
class Panel {
	constructor(readonly props: Props<PanelProps>) {}

	render() {
		return (
			<frame Name="Panel">
				<textLabel Text={this.props.title} />
				{fragment(this.props.children)}
			</frame>
		);
	}
}

@ui
class Badge {
	constructor(readonly props: Props<{ text: string }>) {}

	render() {
		return <textLabel Text={this.props.text} />;
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

This lowers to the same shape as:

```ts
child(Panel, {
	title: "Loadout",
	children: [
		child(Badge, { text: "Sword" }, { key: "sword" }),
		child(Badge, { text: "Shield" }, { key: "shield" }),
	],
});
```

`children` is just a normal prop. The wrapper decides where to render it, usually
with `fragment(this.props.children)`.

## Key behavior

`key` behaves like React's key:

- It is used for child identity during reconciliation.
- It is not passed through `props`.
- Use it for lists, sorted children, or conditional branches that can move.

```tsx
return (
	<frame>
		{items.map((item) => (
			<ItemRow key={item.id} item={item} />
		))}
	</frame>
);
```

The `ItemRow` instance receives `props.item`, not `props.key`.

## Text children

Raw text children are not supported:

```tsx
// Not supported
<textLabel>Hello</textLabel>
```

Use Roblox text props instead:

```tsx
<textLabel Text="Hello" />
```

The transformer emits a diagnostic when non-whitespace JSX text appears inside a
Rovy UI element.

## Events and refs

Events and refs use the same props as factory calls.

```tsx
<textButton
	Text="Buy"
	events={{
		Activated: (button) => {
			print(button.Name);
		},
	}}
	ref={(button) => {
		print(button.GetFullName());
	}}
/>
```

## Fragments

JSX fragments lower to `fragment(...)`:

```tsx
return (
	<>
		<textLabel Text="A" />
		<textLabel Text="B" />
	</>
);
```

Fragments do not create Roblox Instances. Their children are parented to the
nearest native parent.

## Unsupported JSX forms

- Namespaced attributes are not supported.
- Raw text children are not supported.
- Uppercase tags must be `@ui` classes. Native Roblox Instances use tags such
  as `<frame>`, `<textLabel>`, and `<uiListLayout>`.
- `key` on a spread object is not extracted into identity options; pass `key`
  directly on the JSX element when identity matters.

## Mixing with other JSX libraries

TypeScript only allows one JSX factory per `tsconfig.json`. If the same project
also uses another JSX UI library, keep those files in a separate tsconfig, or use
the non-JSX Rovy UI factories (`frame(...)`, `textLabel(...)`, `child(...)`) in
files compiled with the other library's JSX factory.
