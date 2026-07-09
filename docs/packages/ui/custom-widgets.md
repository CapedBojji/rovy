# Rovy UI Custom Components

Custom retained components are classes decorated with `@ui`.

```ts
import { child, frame, textLabel, type Props, ui } from "@rovy/ui";

interface BadgeProps {
	readonly text: string;
}

@ui
class Badge {
	constructor(readonly props: Props<BadgeProps>) {}

	render() {
		return frame(
			{
				BackgroundColor3: Color3.fromRGB(39, 174, 96),
				Size: UDim2.fromOffset(120, 28),
			},
			textLabel({
				BackgroundTransparency: 1,
				Size: UDim2.fromScale(1, 1),
				Text: this.props.text,
			}),
		);
	}
}

@ui
class Root {
	render() {
		return child(Badge, { text: "Ready" });
	}
}
```

## Props

Props are readonly snapshots. When parent props change, the existing component
instance is reused and re-rendered.

```ts
child(Badge, { text: "Equipped" }, { key: "status" });
```

## Render params

`render(...)` params use Rovy injection descriptors just like systems.

```ts
import { type Query } from "@rovy/core";

@ui
class UnitCount {
	render(units: Query<[Unit]>) {
		return textLabel({ Text: `${units.size()} units` });
	}
}
```

Render params do not subscribe automatically. Add a trigger when the component
should rerender from Rovy state changes.

```ts
@ui
class UnitCount {
	static rerender = [$queryTrigger<[Unit]>()];

	render(units: Query<[Unit]>) {
		return textLabel({ Text: `${units.size()} units` });
	}
}
```
