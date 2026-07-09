# Rovy UI Reconciliation

Rovy UI is retained. A component render returns a tree description, and the
runtime reconciles that description against the existing mounted tree.

## Identity

For each node, identity is:

```ts
key ?? __callsite ?? "implicit"
```

The runtime also compares node kind and type:

- component nodes compare component class
- native nodes compare Roblox class name
- fragment nodes compare fragment identity

If identity and type match, the old node is reused. If not, the old subtree is
destroyed and a new subtree is mounted.

## Generated callsites

The transformer adds `__callsite` to factory calls and JSX elements. This keeps
fixed children stable without manual keys:

```tsx
<frame>
	<textLabel Text="Name" />
	<textLabel Text="Value" />
</frame>
```

Those two labels get different generated callsites, so they can be reconciled as
distinct stable children.

## Explicit keys

Explicit `key` overrides generated callsite identity:

```tsx
{items.map((item) => (
	<ItemRow key={item.id} item={item} />
))}
```

Use keys for:

- arrays from `map`
- sorted lists
- filtered lists
- conditional branches where a child can move
- duplicate component classes under the same parent

`key` is not passed through component props.

## Prop updates

When a parent returns the same child component identity with new props, the
existing child component instance is reused and its props snapshot is updated.
If props changed, that child rerenders.

```ts
child(HealthRow, { entity, health }, { key: entity });
```

If `health` changes and `entity` key is the same, `HealthRow` keeps its instance
and rerenders with the new props.

## Native prop updates

Native Instance props are patched in place:

```ts
textLabel({
	Text: this.props.label,
	TextColor3: this.props.color,
});
```

On rerender, changed prop values are assigned to the existing Instance. Unchanged
values are skipped.

The `events` prop has special cleanup behavior. See
[Events And Refs](/packages/ui/events-and-refs).

## Fragments

Fragments do not create Roblox Instances:

```tsx
<>
	<textLabel Text="A" />
	<textLabel Text="B" />
</>
```

Fragment children are reconciled under the nearest native parent.

## Rerender scheduling

When a trigger marks a component dirty, the component is queued in a set and
flushed with `task.defer(...)`. Multiple triggers in the same turn still produce
one rerender for that component.

Only the dirty component subtree rerenders. The whole mounted root is not
recreated unless root identity changes or the mount is destroyed.
