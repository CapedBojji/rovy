# Rovy UI Events And Refs

Native Roblox events are connected through the `events` prop. Refs are passed
through the `ref` prop.

These props belong to native Instance nodes such as `textButton(...)` or
`<textButton />`, not to custom component nodes unless your own component chooses
to forward them.

## Events with factories

```ts
textButton({
	Name: "BuyButton",
	Text: "Buy",
	events: {
		Activated: (button) => {
			print(button.Name);
		},
	},
});
```

The callback receives the mounted Instance first, followed by Roblox signal
arguments.

## Events with JSX

```tsx
<textButton
	Name="BuyButton"
	Text="Buy"
	events={{
		Activated: (button) => {
			print(button.Name);
		},
		MouseMoved: (button, x, y) => {
			print(button.Name, x, y);
		},
	}}
/>
```

## Cleanup on rerender

`@rovy/ui` tracks event connections per native node.

On rerender:

- replacing a callback disconnects the old connection before connecting the new
  callback
- removing one event name disconnects that event's connection
- removing the whole `events` prop disconnects all tracked event connections
- destroying the native node disconnects its remaining event connections

This means changing event handlers during rerender does not leave old handlers
listening in the background.

```ts
@ui
class ToggleButton {
	constructor(readonly props: Props<{ onClick: () => void }>) {}

	render() {
		return textButton({
			Text: "Toggle",
			events: {
				Activated: () => this.props.onClick(),
			},
		});
	}
}
```

If the parent passes a new `onClick`, the `Activated` connection is swapped on
the next child rerender.

## Stable event tables

Native props are compared by reference. If you mutate an existing `events` table
in place, `@rovy/ui` may not see a changed prop value.

Prefer replacing the table:

```ts
return textButton({
	Text: "Buy",
	events: {
		Activated: this.props.onBuy,
	},
});
```

Avoid mutating a reused table:

```ts
events.Activated = nextHandler;
return textButton({ events });
```

## Refs

Use `ref` when you need the created Roblox Instance:

```ts
frame({
	ref: (instance) => {
		print(instance.GetFullName());
	},
});
```

JSX form:

```tsx
<frame
	ref={(instance) => {
		print(instance.GetFullName());
	}}
/>
```

The ref function is called when the prop is applied. If the same ref function is
passed on a later rerender, it is not called again. If a different ref function
is passed, the new one is called with the existing Instance.
