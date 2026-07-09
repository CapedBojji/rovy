# Rovy UI Rerender Triggers

`render(...)` params and rerender triggers are intentionally separate.

Render params answer: "What data does this component read when it renders?"
Rerender triggers answer: "Which Rovy changes should cause this component to
render again?"

For a full guide to render params, see [Render Injection](/packages/ui/render-injection).

```ts
@ui
class ScoreLabel {
	static rerender = [$resourceTrigger(Score)];

	render(score: Res<Score>) {
		return textLabel({ Text: `Score: ${score.value}` });
	}
}
```

Without `static rerender`, the component still receives `Score` during its first
render, but it will not automatically update when the resource changes.

## Dirty and flush cycle

When a trigger fires, `@rovy/ui` marks the owning component dirty. Dirty
components are stored in a set so repeated changes in the same turn only produce
one queued rerender. The flush is scheduled with `task.defer(...)`.

During the flush:

1. The component's `render(...)` method runs again with freshly resolved params.
2. The returned `UiNode` tree is reconciled against the previous subtree.
3. Existing Roblox Instances are patched when identity matches.
4. Old nodes are destroyed when identity no longer matches.

Mount-time render errors throw. Deferred rerender errors are caught and warned so
one broken component does not stop sibling components from updating.

## Query triggers

```ts
static rerender = [
	$queryTrigger<[Entity, Health], With<Visible>>({
		on: ["added", "changed", "removed"],
	}),
];

render(units: Query<[Entity, Health], With<Visible>>) {
	return textLabel({ Text: `${units.size()} visible units` });
}
```

The transformer hoists a query descriptor for the trigger and stores its handle
in the UI metadata. At mount time, `@rovy/ui` looks up that query from the app's
scheduler query registry.

Then it listens to broad world changes that can affect query membership or row
values:

- entity spawned
- entity despawned
- component added
- component changed
- component removed
- relation added
- relation changed
- relation removed

On each change, `@rovy/ui` snapshots the query. It compares the current
entity-keyed rows with the previous snapshot:

- `added` fires when an entity is now in the query but was not before.
- `changed` fires when an entity stayed in the query but one of its row values
  changed by reference/value equality.
- `removed` fires when an entity was in the query and is no longer present.

The `on` option filters which of those differences mark the component dirty. If
you omit `on`, all three are enabled.

## Component triggers

```ts
interface RowProps {
	readonly entity: Entity;
}

@ui
class HealthRow {
	static rerender = [
		$componentTrigger(Health, {
			entity: $prop<Entity>("entity"),
			on: ["changed", "removed"],
		}),
	];

	constructor(readonly props: Props<RowProps>) {}

	render(health: Query<[Entity, Health]>) {
		return textLabel({ Text: "row" });
	}
}
```

Component triggers subscribe directly to component lifecycle callbacks on the
app:

- `added` uses `app.on_component_added(Health, callback)`.
- `changed` uses `app.on_component_changed(Health, callback)`.
- `removed` uses `app.on_component_removed(Health, callback)`.

`entity: $prop("entity")` means the trigger only fires when the lifecycle record
entity equals `this.props.entity`. If `entity` is omitted, any matching component
event marks the component dirty.

## Resource triggers

```ts
static rerender = [$resourceTrigger(Theme)];

render(theme: Res<Theme>) {
	return frame({ BackgroundColor3: theme.panel });
}
```

Resource triggers subscribe to `app.on_resource_changed(Theme, callback)`.
Whenever that resource is inserted or changed through Rovy's resource mutation
path, the component is marked dirty.

## Event triggers

```ts
static rerender = [$eventTrigger(InventoryChanged)];

render(events: EventReader<InventoryChanged>) {
	return textLabel({ Text: `${events.size()} pending changes` });
}
```

Event triggers use two checks:

- They observe writes to the event registry and mark dirty when the event type is
  sent.
- They also check the event reader size on post-flush, so an event still present
  in the reader buffer can keep the UI in sync for that frame.

Use event triggers for short-lived feeds, notifications, counters, and UI that
reacts to buffered events.

## Relation triggers

```ts
static rerender = [
	$relationTrigger(EquippedBy, {
		source: $prop<Entity>("item"),
		on: ["added", "removed"],
	}),
];
```

Relation triggers mirror component triggers, but they listen to relation
lifecycle callbacks:

- `added` uses `app.on_relation_added(EquippedBy, callback)`.
- `changed` uses `app.on_relation_changed(EquippedBy, callback)`.
- `removed` uses `app.on_relation_removed(EquippedBy, callback)`.

`source` matches the lifecycle record entity. `target` matches the lifecycle
record target. Either can use `$prop(...)`; omitted bindings match any source or
target.

## Lifecycle triggers

```ts
static rerender = [$lifecycleTrigger("entity_despawned")];
```

Lifecycle triggers subscribe through the app lifecycle registry. If you pass a
constructor, the trigger is scoped to that lifecycle kind and constructor. If you
omit the constructor, any record for that lifecycle kind marks the component
dirty.

## Props trigger

```ts
static rerender = [$propsTrigger()];
```

Props changes already rerender child components during reconciliation, so
`$propsTrigger()` is mostly a marker for explicitness and future-compatible
metadata. Today the runtime does not create an extra subscription for it.

## Choosing the smallest trigger

Prefer the narrowest trigger that describes the UI's dependency:

- Use `$resourceTrigger` for a single resource.
- Use `$componentTrigger` when one known entity prop owns the data.
- Use `$relationTrigger` when the dependency is a relation source or target.
- Use `$queryTrigger` when membership and row changes across a query matter.
- Use `$eventTrigger` for transient event buffers.

Narrow triggers do less comparison work and avoid rerendering UI that did not
observe the changed data.
