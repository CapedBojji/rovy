# Custom Widgets

Custom widgets are normal TypeScript functions tagged with `/** @widget */`. The transformer wraps them and lowers calls so widget state has stable callsite identity.

```ts
/** @widget */
export function Counter(): void {
	const [count, setCount] = useState(0);
	label(`Count: ${count}`);
	if (button("Increment").clicked()) setCount((value) => value + 1);
}
```

Call it like a built-in:

```ts
Counter();
```

## Rules

- `/** @widget */` must be on a function declaration, not an arrow or variable.
- A same-file implementation is required.
- Overloads are allowed.
- Widgets must not yield.
- Storage helpers must run inside a widget frame.

## Style Parameter Sugar

You can author an overload where the implementation receives `style: Style`, while callers do not pass it.

```ts
/** @widget */
export function HealthBar(current: number, max: number): void;
export function HealthBar(style: Style, current: number, max: number): void {
	progressBar({ value: current / max, label: "HP" });
	label(`${current} / ${max}`, { color: style.textDisabledColor });
}
```

Callers write:

```ts
HealthBar(player.health, player.maxHealth);
```

The transformer removes the style parameter from the public call and injects the active style in the implementation.

## Stable Identity

Rovy UI has two important identities:

- Widget definition identity, carried by `RovyUi.__widget(fn, { id, name })`.
- Widget callsite identity, produced by lowering widget calls through `RovyUi.__scope(...)`.

This means two calls to the same widget at different callsites have separate state. In loops, use `useKey` to split repeated calls at the same callsite.

```ts
for (const item of inventory) {
	useKey(item.id);
	ItemRow(item);
}
```

## Instances

Use `useInstance` for custom Roblox GUI objects.

```ts
/** @widget */
export function Badge(text: string): void {
	const refs = useInstance((ref) =>
		create("TextLabel", {
			[ref as never]: "label",
			BackgroundTransparency: 1,
			Size: new UDim2(0, 120, 0, 24),
		}),
	) as { label: TextLabel };

	refs.label.Text = text;
}
```

Return an `Instance` to make it the widget node's mounted instance. Return `[instance, container]` when children should parent somewhere inside the instance.

## Context

Contexts let custom widgets share data without threading parameters through every call.

```ts
const ThemeContext = createContext<"dark" | "light">("Theme");

/** @widget */
export function ThemeProvider(mode: "dark" | "light", children: () => void): void {
	provideContext(ThemeContext, mode);
	children();
}

/** @widget */
export function ThemedLabel(text: string): void {
	const mode = useContext(ThemeContext) ?? "dark";
	label(text, {
		color: mode === "dark" ? Color3.fromRGB(255, 255, 255) : Color3.fromRGB(0, 0, 0),
	});
}
```

## Transformer Contract

The transformer:

- detects `/** @widget */` functions and built-in widget declarations
- wraps consumer widgets through `RovyUi.__widget(...)`
- lowers widget calls into scoped calls
- lowers storage helpers to keyed internals
- injects active style for leading `style: Style` implementation parameters

Consumer code should stay at the public function-call level.
