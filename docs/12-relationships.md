# Relationships

Status: To be decided. Concrete wrapper design over jecs pairs/relationships is still open.

## Possible API

```ts
commands.relate(source, Relationship, target);
commands.unrelate(source, Relationship, target);
```

## Example

```ts
commands.relate(castEntity, CastCaster, caster);
commands.relate(castEntity, CastTarget, target);
```

## Use cases

- caster → target
- cast entity → caster
- cast entity → target
- projectile → source
- aura → owner
- unit → player

## Open

- Query syntax for "find all X related to Y by R".
- Lifecycle observers on relationships (`onRelate`, `onUnrelate`).
- Symmetric vs asymmetric relations.
- Cleanup semantics when one side despawns.

See [Open questions](16-open-questions.md).
