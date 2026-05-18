# `rovy-transformer` Plan Index

> Split tracker. Use this as the main entrypoint. Each phase lives in its own file under `plans/transformer/phases/`.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done

## Context

`@rovy/core` is implemented and the transformer/runtime boundary is frozen in `packages/core/src/contract.ts`. The transformer must emit registry calls matching that contract, even where older docs still show conceptual snippets.

Planned UI docs currently lock a separate, function-first contract for `@rovy/ui`: JSDoc-tagged widget functions, wrapping through `RovyUi.__widget(...)`, `style: Style` lowered to `RovyUi.getActiveStyle()`, and callback-bounded `StyleScope(...)` for temporary style changes.

Main doc references:

- [docs/10-transformer.md](/Users/reikan404/Documents/rovy/docs/10-transformer.md)
- [docs/19-compiled-output.md](/Users/reikan404/Documents/rovy/docs/19-compiled-output.md)
- [docs/20-runtime-lifecycle.md](/Users/reikan404/Documents/rovy/docs/20-runtime-lifecycle.md)

## Frozen Runtime Targets

- `rovy.__component(ctor, id)`
- `rovy.__resource(ctor, id)`
- `rovy.__event(ctor, options?)`
- `rovy.__system(ctor, meta)`
- `rovy.__observer(ctor, meta)`
- `rovy.__monitor(ctor, meta)`
- `rovy.__relation(ctor, meta)`
- `rovy.__schedule(ctor, meta)`
- `rovy.__traitImpl(traitId, ctor)`
- `rovy.__query(descriptor)`
- `rovy.traitToken(id)`
- `rovy.loadPaths(...)`

## Phases

- [Phase 00](/Users/reikan404/Documents/rovy/plans/transformer/phases/phase-00.md)
- [Phase 01](/Users/reikan404/Documents/rovy/plans/transformer/phases/phase-01.md)
- [Phase 02](/Users/reikan404/Documents/rovy/plans/transformer/phases/phase-02.md)
- [Phase 03](/Users/reikan404/Documents/rovy/plans/transformer/phases/phase-03.md)
- [Phase 04](/Users/reikan404/Documents/rovy/plans/transformer/phases/phase-04.md)
- [Phase 05](/Users/reikan404/Documents/rovy/plans/transformer/phases/phase-05.md)
- [Phase 06](/Users/reikan404/Documents/rovy/plans/transformer/phases/phase-06.md)
- [Phase 07](/Users/reikan404/Documents/rovy/plans/transformer/phases/phase-07.md)
- [Phase 08](/Users/reikan404/Documents/rovy/plans/transformer/phases/phase-08.md)

## Verification

- `mise exec -- pnpm --filter rovy-transformer test`
- `mise exec -- pnpm --filter rovy-transformer build`

## How To Use

1. Open the specific phase file you are working on.
2. Keep contract-level notes here in the index.
3. Use the root [PLAN-transformer.md](/Users/reikan404/Documents/rovy/PLAN-transformer.md) only as a compatibility pointer.
