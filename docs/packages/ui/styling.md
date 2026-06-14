# Styling

Every widget reads the active `Style`. Built-in widgets use the style for colors, borders, text size, spacing, title bars, scrollbar color, and interaction states.

## Reading The Active Style

```ts
const style = useStyle();
const sameStyle = getActiveStyle();
```

Inside custom widgets, use `useStyle()` unless you are using the leading `style: Style` authoring sugar described in [Custom Widgets](/packages/ui/custom-widgets).

## `StyleScope`

Use `StyleScope` to temporarily patch style values for one subtree.

```ts
StyleScope(
	{
		patch: {
			textColor: Color3.fromRGB(255, 230, 160),
			widgetActiveBgColor: Color3.fromRGB(80, 60, 20),
		},
	},
	() => {
		label("Rare item");
		button("Equip");
	},
);
```

When the child function returns, the parent style is restored automatically.

## Loop Discriminators

If the same `StyleScope` callsite is reached for different data in a loop, use `discriminator`.

```ts
for (const item of items) {
	StyleScope(
		{
			discriminator: item.id,
			patch: {
				textColor: item.rare ? Color3.fromRGB(255, 220, 120) : useStyle().textColor,
			},
		},
		() => label(item.name),
	);
}
```

## `setStyle`

```ts
setStyle(patch: Partial<Style>): void
```

`setStyle` patches the active style for the rest of the current frame scope. Prefer `StyleScope` for most UI because `setStyle` is intentionally unbounded.

## Theme Shape

The `Style` interface lives in `packages/ui/src/style.ts`. It includes:

- text colors
- background colors
- active/hover/disabled widget colors
- stroke colors and transparency
- window, title, panel, and popup colors
- spacing, padding, item height, scrollbar size
- corner radius and shadow settings

Use the source file as the precise reference while the docs are still hand-authored.
