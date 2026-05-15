# Open Questions

Unresolved design points. Each lists current preference; that preference is not final.

## Component registration

Do all classes used in `world.spawn` / `query` get auto-registered by the transformer?

Possible answer: yes — any class used as a component term or instantiated in spawn/insert gets registered.

## Tag syntax

Should tags be passed by constructor:

```ts
world.spawn(Unit);
```

or by instance:

```ts
world.spawn(new Unit());
```

Current preference:

```ts
world.spawn(Unit);
```

## Trait macro name

Options:

```ts
trait<CrowdControl>()
asTrait<CrowdControl>()
```

Current preference:

```ts
trait<CrowdControl>()
```

Reason: short.

## Event API

Class-instance only:

```ts
commands.trigger(new DamageTaken(...));
```

or class + payload:

```ts
commands.trigger(DamageTaken, {...});
```

Current preference:

```ts
commands.trigger(new DamageTaken(...));
```

## Relationship API

Still needs a concrete wrapper design over jecs pairs/relationships. See [Relationships](12-relationships.md).

## Scheduler

Build a custom thin scheduler first, or wrap Planck?

Current preference: custom thin scheduler for the battle sim.

## See also

- [Decisions](15-decisions.md)
- [Roadmap](17-roadmap.md)
