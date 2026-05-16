# `rovy-transformer` Implementation Plan & Progress Tracker

> Living tracker for the roblox-ts transformer. Keep this synced as phases land.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done

## Context

`@rovy/core` is implemented and the transformer/runtime boundary is frozen in
`packages/core/src/contract.ts` (`CONTRACT_VERSION = 1`). The transformer must
emit registry calls matching that contract, even where older docs still show
conceptual split-argument snippets.

Frozen runtime target:

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

Source of truth: `packages/core/src/contract.ts`, plus docs
`10-transformer`, `19-compiled-output`, and `20-runtime-lifecycle`.

## Phases

### [x] Phase 0 — Tracker + contract audit

- [x] Create this tracker.
- [x] Record frozen `rovy.__*` target surface.
- [x] Record contract-wins-over-docs note.

### [x] Phase 1 — Transformer infrastructure

- [x] `TransformState` with program/context/typeChecker access, stable IDs,
      import injection, diagnostics, path helpers, and optional Rojo resolver.
- [x] AST factory helpers for values, calls, arrays, objects, imports.
- [x] Whole-program prepass indexing decorated classes and interfaces from
      `implements` clauses.
- [x] roblox-ts-style factory smoke test.

### [x] Phase 2 — Decorator scan + registration injection

- [x] Detect Rovy imports from `@rovy/core`.
- [x] Support bare `@component`, `@resource`, `@plugin`, `@relation`,
      `@schedule`.
- [x] Support factory decorators `@event`, `@system`, `@observer`, `@monitor`,
      `@relation`, `@schedule`, `@set`.
- [x] Inject registration statements next to class declarations.
- [x] Preserve class bodies while removing consumed Rovy decorators.

### [x] Phase 3 — Query + param lowering

- [x] Parse `run`, `onEnter`, `onExit`, and `onChange` parameter type nodes.
- [x] Lower injection wrappers and monitor term/entity params.
- [x] Lower `Query<[Terms], ...Filters>` into `QueryDescriptor`.
- [x] Emit one `rovy.__query(descriptor)` per query param and monitor match.

### [x] Phase 4 — Traits, macros, relationships, loadPaths

- [x] Rewrite `trait<T>()` to `rovy.traitToken(id)`.
- [x] Rewrite monitor `query<...>()` by hoisting descriptor and storing match id.
- [x] Inject `rovy.__traitImpl(traitId, component)` for explicit component
      `implements`.
- [x] Lower `Trait`, `AllTraits`, `HasTrait`, `Pair`, and `HasPair`.
- [x] Lower resolvable `rovy.loadPaths("src/...")` strings through Rojo output
      paths to Roblox Instance expressions.

### [~] Phase 5 — Validation + diagnostics

- [x] Reject generic decorated system/observer/monitor classes.
- [x] Reject `@resource` constructors with required non-default params.
- [x] Reject `@observer` without valid `event`.
- [x] Validate monitor methods share the same lowered param descriptors.
- [x] Diagnose unsupported query/param shapes.
- [ ] Expand diagnostics as new edge cases appear in real projects.

### [~] Phase 6 — Tests + fixtures

- [x] Add smoke fixture covering decorators, queries, params, traits, macros.
- [x] Assert normalized transformed TS contains expected registry calls.
- [ ] Add roblox-ts compile-to-Luau integration fixture.
- [ ] Add Rojo-backed `loadPaths` fixture in a sample game tree.

## Verification

- `mise exec -- pnpm --filter rovy-transformer test`
- `mise exec -- pnpm --filter rovy-transformer build`

