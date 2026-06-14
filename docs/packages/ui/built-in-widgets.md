# Built-in Widgets

All built-ins are plain functions exported from `@rovy/ui`. Import named helpers or use the default `RovyUi` object.

```ts
import { button, label, window } from "@rovy/ui";

window("Inventory", () => {
	label("Items");
	if (button("Sort").clicked()) sortItems();
});
```

## Windows And Containers

### `window`

```ts
window(title: string, children: () => void): WindowHandle
window(options: WindowOptions, children: () => void): WindowHandle
```

```ts
interface WindowOptions {
	title?: string;
	size?: Vector2;
	position?: Vector2;
	closable?: boolean;
	minimizable?: boolean;
	movable?: boolean;
	resizable?: boolean;
	scrollX?: boolean;
	scrollY?: boolean;
}

interface WindowHandle {
	closed(): boolean;
	minimized(): boolean;
}
```

### `childWindow`

```ts
childWindow(title: string, children: () => void): ChildWindowHandle
childWindow(options: ChildWindowOptions, children: () => void): ChildWindowHandle
```

```ts
interface ChildWindowOptions {
	title?: string;
	height?: number;
	minimizable?: boolean;
	scrollX?: boolean;
	scrollY?: boolean;
}
```

### `modal`

```ts
modal(title: string, children: () => void): ModalHandle
modal(options: ModalOptions, children: () => void): ModalHandle
```

```ts
interface ModalOptions {
	title?: string;
	open?: boolean;
	closable?: boolean;
}
```

### `popup`

```ts
popup(options: PopupOptions, children: () => void): void
```

```ts
interface PopupOptions {
	open?: boolean;
	position?: Vector2;
	width?: number;
	minWidth?: number;
}
```

`popup` renders into a portal panel and is useful for menus, floating controls, and context panels. Pass `position` for explicit screen placement.

### `portal`

```ts
portal(targetInstance: Instance, children: () => void): void
```

### `row`

```ts
row(children: () => void): void
row(options: RowOptions, children: () => void): void
```

```ts
interface RowOptions {
	padding?: number | UDim;
	alignment?: CastsToEnum<Enum.HorizontalAlignment>;
	verticalAlignment?: CastsToEnum<Enum.VerticalAlignment>;
	scrollX?: boolean;
}
```

## Buttons And Selection Controls

### `button`

```ts
button(text: string, options?: ButtonOptions): ButtonHandle
```

```ts
interface ButtonOptions {
	width?: number | UDim;
	disabled?: boolean;
}

interface ButtonHandle {
	clicked(): boolean;
}
```

### `checkbox`

```ts
checkbox(text: string, options?: CheckboxOptions): CheckboxHandle
```

```ts
interface CheckboxOptions {
	checked?: boolean;
	disabled?: boolean;
}

interface CheckboxHandle {
	checked(): boolean;
	clicked(): boolean;
}
```

### `toggle`

```ts
toggle(text: string, options?: ToggleOptions): ToggleHandle
```

```ts
interface ToggleOptions {
	on?: boolean;
	disabled?: boolean;
}
```

### `radioButton`, `selectableLabel`, `clickableLabel`

Use `radioButton` and `selectableLabel` for externally driven selection state, and `clickableLabel` for text that acts as a click target.

```ts
for (const option of options) {
	RovyUi.useKey(option.id);
	const item = RovyUi.radioButton(option.label, { selected: selectedId === option.id });
	if (item.clicked()) selectedId = option.id;
}
```

## Text And Decoration

```ts
label(text: string, options?: LabelOptions): void
heading(text: string, options?: HeadingOptions): void
separator(): void
space(size?: number): void
progressBar(options: ProgressBarOptions): void
```

```ts
interface LabelOptions {
	textSize?: number;
	color?: Color3;
	wrapped?: boolean;
}

interface ProgressBarOptions {
	value: number;
	label?: string;
}
```

## Inputs

### `slider`

```ts
slider(options?: SliderOptions | number): number
```

```ts
interface SliderOptions {
	min?: number;
	max?: number;
	initial?: number;
	label?: string;
	width?: number;
	step?: number;
}
```

### `dragValue`

```ts
dragValue(options?: DragValueOptions): number
```

### `input`

```ts
input(options?: InputOptions): InputHandle
```

```ts
interface InputOptions {
	text?: string;
	placeholder?: string;
	label?: string;
}

interface InputHandle {
	value(): string;
	changed(): boolean;
	submitted(): boolean;
}
```

### `comboBox`

```ts
comboBox(options: ComboBoxOptions): ComboBoxHandle
```

```ts
interface ComboBoxOptions {
	items: string[];
	selected?: string;
	label?: string;
}
```

## Tables

```ts
table(options: TableOptions, children: () => void): void
tableRow(children: () => void): void
tableCell(children: () => void): void
```

```ts
table({ borders: true, stripeRows: true }, () => {
	tableRow({ header: true }, () => {
		tableCell(() => label("Name"));
		tableCell(() => label("Level"));
	});
});
```

## Editable Images

`editableImage` displays a Roblox `EditableImage` from caller-provided RGBA bytes.

```ts
const pixels = new EditableImageBuffer(new Vector2(64, 64));
pixels.drawCircle(new Vector2(32, 32), 12, Color3.fromRGB(255, 255, 255), {
	fill: false,
	thickness: 2,
});

const image = editableImage({ size: pixels.size });
image.draw(pixels.getBuffer());
```

```ts
interface EditableImageOptions {
	size: Vector2;
	displaySize?: UDim2;
	backgroundTransparency?: number;
}
```

`EditableImageBuffer` provides `setPixel`, `fillRect`, `drawLine`, `drawCircle`, `drawPolygon`, `clear`, and `getBuffer`.

## Demo Window

```ts
demoWindow(): void
```

Renders a built-in showcase window for smoke-testing style and widget behavior.
