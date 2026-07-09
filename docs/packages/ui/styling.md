# Rovy UI Styling

`@rovy/ui` uses normal Roblox Instance properties. There is no separate style
object or theme runtime in the retained UI package.

```ts
frame(
	{
		BackgroundColor3: Color3.fromRGB(24, 28, 35),
		BorderSizePixel: 0,
		Size: UDim2.fromOffset(280, 72),
	},
	[
		uiCorner({ CornerRadius: new UDim(0, 8) }),
		uiStroke({
			Color: Color3.fromRGB(76, 86, 106),
			Thickness: 1,
		}),
	],
);
```

## Layout

Use Roblox layout instances as children:

```ts
frame({}, [
	uiPadding({
		PaddingLeft: new UDim(0, 12),
		PaddingRight: new UDim(0, 12),
	}),
	uiListLayout({
		Padding: new UDim(0, 6),
		SortOrder: Enum.SortOrder.LayoutOrder,
	}),
]);
```

## Stable identity

Use `key` for sibling nodes that can be reordered or conditionally shown.

```ts
return frame({}, rows.map((row) => child(RowView, { row }, { key: row.id })));
```

The transformer also injects stable callsite ids for factory and JSX calls, so
fixed children reconcile without manual keys.

## Conditional nodes

Return `false` or `undefined` for absent children.

```ts
frame({}, [
	showTitle && textLabel({ Text: "Inventory" }),
]);
```
