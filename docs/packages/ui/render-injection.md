# Rovy UI Render Injection

`@ui` render methods support the same injection style as Rovy systems. The
transformer reads the `render(...)` parameter types, lowers them into metadata,
and `@rovy/ui` resolves those params every time the component renders.

Render injection is for reading or using data during a render. It does not, by
itself, subscribe the component to future changes.

## Basic resource injection

```ts
import { resource, type Res } from "@rovy/core";
import { $resourceTrigger, frame, textLabel, ui } from "@rovy/ui";

@resource
class Theme {
	constructor(
		readonly panel = Color3.fromRGB(24, 28, 35),
		readonly text = Color3.fromRGB(245, 247, 250),
	) {}
}

@ui
class HudPanel {
	static rerender = [$resourceTrigger(Theme)];

	render(theme: Res<Theme>) {
		return frame(
			{ BackgroundColor3: theme.panel },
			textLabel({
				BackgroundTransparency: 1,
				Text: "Ready",
				TextColor3: theme.text,
			}),
		);
	}
}
```

There are two separate pieces here:

- `render(theme: Res<Theme>)` says this component reads `Theme` when it renders.
- `static rerender = [$resourceTrigger(Theme)]` says changes to `Theme` should
  mark this component dirty so it renders again.

If you remove the trigger, the first render still receives `Theme`, but later
theme changes do not rerender `HudPanel`.

## Query injection

```ts
import { component, type Entity, type Query, type With } from "@rovy/core";
import { $queryTrigger, textLabel, ui } from "@rovy/ui";

@component
class Health {
	constructor(readonly value: number) {}
}

@component
class Visible {}

@ui
class VisibleUnitCount {
	static rerender = [
		$queryTrigger<[Entity, Health], With<Visible>>({
			on: ["added", "changed", "removed"],
		}),
	];

	render(units: Query<[Entity, Health], With<Visible>>) {
		return textLabel({
			Text: `${units.size()} visible units`,
		});
	}
}
```

Again, the render query and trigger query are separate. In many components they
are identical. They do not have to be.

## Reading one query, subscribing to another

Sometimes a component reads broad data but only needs rerendering for a narrower
change set.

```ts
@ui
class SelectedUnitPanel {
	static rerender = [
		$componentTrigger(Health, {
			entity: $prop<Entity>("selected"),
			on: ["changed", "removed"],
		}),
	];

	constructor(readonly props: Props<{ selected: Entity }>) {}

	render(allHealth: Query<[Entity, Health]>) {
		let selectedHealth: Health | undefined;

		allHealth.forEach((entity, health) => {
			if (entity === this.props.selected) selectedHealth = health;
		});

		return textLabel({
			Text: selectedHealth ? `HP ${selectedHealth.value}` : "No unit",
		});
	}
}
```

This component reads `Query<[Entity, Health]>`, but it only rerenders when the
selected entity's `Health` changes or is removed.

## Injecting events

```ts
import { event, type EventReader } from "@rovy/core";
import { $eventTrigger, textLabel, ui } from "@rovy/ui";

@event()
class InventoryChanged {
	constructor(readonly itemId: string) {}
}

@ui
class InventoryToastCount {
	static rerender = [$eventTrigger(InventoryChanged)];

	render(events: EventReader<InventoryChanged>) {
		return textLabel({
			Text: `${events.size()} pending inventory changes`,
		});
	}
}
```

`EventReader` lets the render method inspect the buffered events. `$eventTrigger`
is what schedules a rerender when matching events are sent.

## Injecting world and commands

```ts
import { resource, type Commands, type Res } from "@rovy/core";
import { textButton, ui } from "@rovy/ui";

@resource
class SpawnStats {
	constructor(readonly count = 0) {}
}

@ui
class SpawnButton {
	render(stats: Res<SpawnStats>, commands: Commands) {
		return textButton({
			Text: `Spawn (${stats.count})`,
			events: {
				Activated: () => {
					commands.spawn();
				},
			},
		});
	}
}
```

`Commands` is resolved fresh when the component renders. Mutating in event
callbacks should usually use Rovy's deferred command model. You can also inject
`World` for direct reads when a query or resource is not the right shape.

## Local state

`Local<T>` persists across rerenders of the same mounted component node.

```ts
import { type Local } from "@rovy/core";
import { textLabel, ui } from "@rovy/ui";

interface RenderCount {
	value: number;
}

@ui
class RenderCounter {
	render(local: Local<RenderCount>) {
		local.value += 1;
		return textLabel({ Text: `renders ${local.value}` });
	}
}
```

The local slot belongs to that component node. If the node is remounted because
its key/type identity changes, it receives a fresh local slot.

## What is lowered

Source:

```ts
@ui
class HudPanel {
	static rerender = [$resourceTrigger(Theme)];

	render(theme: Res<Theme>, units: Query<[Entity, Health]>) {
		return textLabel({ Text: `${units.size()}` });
	}
}
```

Conceptual metadata:

```ts
rovyUi.__ui(HudPanel, {
	id: "src/client/HudPanel@HudPanel",
	methods: ["render"],
	params: [
		{ kind: "res", ctor: Theme },
		{ kind: "query", handle: "src/client/HudPanel:0" },
	],
	triggers: [
		{ kind: "resource", ctor: Theme },
	],
});
```

`params` is render injection. `triggers` is rerender subscription. The runtime
uses `params` when it calls `render(...)`; it uses `triggers` when mounting the
component to install dirty-marking subscriptions.

## Rule of thumb

- Put something in `render(...)` when the component needs to read it.
- Put something in `static rerender` when changes to it should rerender the
  component.
- Do both when the UI reads data and should stay live as that data changes.
- Use different params and triggers when the read shape and subscription shape
  are not the same.
