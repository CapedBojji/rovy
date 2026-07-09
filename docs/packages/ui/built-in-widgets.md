# Rovy UI Built-in Factories

`@rovy/ui` creates Roblox Instances through small factory functions. Each
factory accepts a native property table and optional children.

```ts
frame({ Name: "Panel" }, [
	uiCorner({ CornerRadius: new UDim(0, 8) }),
	textLabel({ Text: "Hello" }),
]);
```

## Native factories

- `frame`
- `textLabel`
- `textButton`
- `imageLabel`
- `imageButton`
- `scrollingFrame`
- `canvasGroup`
- `textBox`
- `viewportFrame`

## Layout and constraints

- `uiListLayout`
- `uiGridLayout`
- `uiPadding`
- `uiCorner`
- `uiStroke`
- `uiScale`
- `uiAspectRatioConstraint`
- `uiSizeConstraint`

## Generic native factory

Use `native(...)` when a built-in shortcut does not exist.

```ts
import { native } from "@rovy/ui";

const gradient = native("UIGradient", {
	Color: new ColorSequence(Color3.fromRGB(255, 255, 255)),
});
```

## Events and refs

Pass Roblox signal callbacks through the `events` prop. The callback receives
the mounted Instance first, followed by signal args.

```ts
textButton({
	Text: "Buy",
	events: {
		Activated: (button) => {
			print(button.Name);
		},
	},
});
```

Use `ref` when you need the created Instance.

```ts
frame({
	ref: (instance) => {
		print(instance.GetFullName());
	},
});
```
