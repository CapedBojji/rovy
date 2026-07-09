# Rovy UI Render Injection

`@ui` render methods can ask Rovy for data by putting typed params in
`render(...)`. When the component renders, Rovy looks at those params and passes
the matching values in.

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

For selected lists, use the query trigger's `entities` binding:

```ts
@ui
class SelectedRows {
	static rerender = [
		$queryTrigger<[Entity, Health]>({
			entities: $prop<ReadonlyArray<Entity>>("entities"),
			on: ["changed", "removed"],
		}),
	];

	constructor(readonly props: Props<{ entities: ReadonlyArray<Entity> }>) {}

	render(rows: Query<[Entity, Health]>) {
		return frame(
			{},
			this.props.entities.map((entity) =>
				child(HealthRow, { entity }, { key: entity }),
			),
		);
	}
}
```

Here `render(rows)` can read the full health query, while `entities:
$prop("entities")` limits which row diffs schedule the next render.

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

## Reading and changing the world

```ts
import { component, resource, type Commands, type Entity, type Res, type World } from "@rovy/core";
import { textButton, ui, type Props } from "@rovy/ui";

@component
class SpawnedByUi {}

@resource
class SpawnStats {
	constructor(readonly count = 0) {}
}

@ui
class SpawnButton {
	constructor(readonly props: Props<{ selected?: Entity }>) {}

	render(stats: Res<SpawnStats>, commands: Commands, world: World) {
		const selectedHasMarker =
			this.props.selected !== undefined &&
			world.has(this.props.selected, SpawnedByUi);

		return textButton({
			Text: selectedHasMarker ? `Spawned (${stats.count})` : `Spawn (${stats.count})`,
			events: {
				Activated: () => {
					commands.spawn(new SpawnedByUi());
				},
			},
		});
	}
}
```

Use `Commands` when a UI action should change game state. In the example above,
the button click does not edit the world right in the middle of the click
handler. It puts a spawn request into `commands`, and Rovy applies that request
at the normal command flush point.

That matters because systems, monitors, and UI can all be looking at the world
at the same time. If one callback changes the entity list while something else
is looping through it, the result can be confusing. Commands make the change
happen a moment later, in the same place all other queued changes happen.

Use `World` when you only need to check something right now. In the example,
`world.has(this.props.selected, SpawnedByUi)` asks, "does this selected entity
currently have this component?" No list is needed, and no resource is needed.

A simple rule:

- Use `Query<...>` when the UI wants a list of matching entities.
- Use `Res<T>` when the UI wants one shared value.
- Use `World` when the UI wants one direct lookup, like "does this entity have
  Health?" or "what is this entity's Position?"
- Use `Commands` when a click or input should spawn, despawn, add, remove, or
  replace components.

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
