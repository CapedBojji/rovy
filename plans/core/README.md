# `@rovy/core` Plan Index

> Split tracker. Use this as the main entrypoint. Each phase lives in its own file under `plans/core/phases/`.

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done · ⛔ blocked

## Context

`/Users/reikan404/Documents/rovy` is a specs-first repo. Core runtime lives in `packages/core`, transformer in `packages/transformer`, networking in `packages/networking`, and planned UI work is docs-first right now. The frozen transformer↔runtime boundary is the `rovy.__*` contract plus related descriptor types in core.

Keep these specs nearby while working:

- [docs/19-compiled-output.md](/Users/reikan404/Documents/rovy/docs/19-compiled-output.md)
- [docs/20-runtime-lifecycle.md](/Users/reikan404/Documents/rovy/docs/20-runtime-lifecycle.md)
- [docs/16-change-detection.md](/Users/reikan404/Documents/rovy/docs/16-change-detection.md)
- [docs/18-monitors.md](/Users/reikan404/Documents/rovy/docs/18-monitors.md)

## Locked Decisions

- Test harness: `@rbxts/jest` + `@rbxts/jest-globals` headless under Lune.
- `StandardPlugin` stays outside `@rovy/core`.
- Internal jecs typings are vendored where needed.
- v1 resolutions: no generics on `@system` / `@monitor` / `@observer`; `ResMut` is advisory-only; `onChange` is not deduped per step.

## Milestones

### Milestone 1 — Usable Core (Phases 0–6)

- [Phase 00](/Users/reikan404/Documents/rovy/plans/core/phases/phase-00.md)
- [Phase 01](/Users/reikan404/Documents/rovy/plans/core/phases/phase-01.md)
- [Phase 02](/Users/reikan404/Documents/rovy/plans/core/phases/phase-02.md)
- [Phase 03](/Users/reikan404/Documents/rovy/plans/core/phases/phase-03.md)
- [Phase 04](/Users/reikan404/Documents/rovy/plans/core/phases/phase-04.md)
- [Phase 05](/Users/reikan404/Documents/rovy/plans/core/phases/phase-05.md)
- [Phase 06](/Users/reikan404/Documents/rovy/plans/core/phases/phase-06.md)

### Milestone 2 — Full Surface (Phases 7–12)

- [Phase 07](/Users/reikan404/Documents/rovy/plans/core/phases/phase-07.md)
- [Phase 08](/Users/reikan404/Documents/rovy/plans/core/phases/phase-08.md)
- [Phase 09](/Users/reikan404/Documents/rovy/plans/core/phases/phase-09.md)
- [Phase 10](/Users/reikan404/Documents/rovy/plans/core/phases/phase-10.md)
- [Phase 11](/Users/reikan404/Documents/rovy/plans/core/phases/phase-11.md)
- [Phase 12](/Users/reikan404/Documents/rovy/plans/core/phases/phase-12.md)

### Milestone 3 — External Signal Bridge (Phases 13–15)

- [Phase 13](/Users/reikan404/Documents/rovy/plans/core/phases/phase-13.md)
- [Phase 14](/Users/reikan404/Documents/rovy/plans/core/phases/phase-14.md)
- [Phase 15](/Users/reikan404/Documents/rovy/plans/core/phases/phase-15.md)

### Milestone 4 — Networking Package MVP (Phase 16)

- [Phase 16](/Users/reikan404/Documents/rovy/plans/core/phases/phase-16.md)

### Milestone 5 — Prefabs (Planned)

- [Phase 17](/Users/reikan404/Documents/rovy/plans/core/phases/phase-17.md)
- [Phase 18](/Users/reikan404/Documents/rovy/plans/core/phases/phase-18.md)
- [Phase 19](/Users/reikan404/Documents/rovy/plans/core/phases/phase-19.md)
- [Phase 20](/Users/reikan404/Documents/rovy/plans/core/phases/phase-20.md)

### Milestone 7 — UI Docs / Widget Model (Planned)

Future UI work is docs-first for now: full Roblox TS authoring, one JSDoc-tagged widget function per widget, plain calls like `Window(args)`, wrapped through `RovyUi.__widget(...)`, `style: Style` lowered to `RovyUi.getActiveStyle()`, and temporary style changes expressed through callback-bounded `StyleScope(...)`, with no public widget classes or hook model.

- [Phase 21](/Users/reikan404/Documents/rovy/plans/core/phases/phase-21.md)
- [Phase 22](/Users/reikan404/Documents/rovy/plans/core/phases/phase-22.md)
- [Phase 23](/Users/reikan404/Documents/rovy/plans/core/phases/phase-23.md)

## Risks

- jecs internal API reality still matters for some older phase notes.
- Variadic tuple inference is central to query typing.
- Monitor correctness around `Without` and change detection must stay covered by tests.
- Lune is still not a full Roblox runtime, so any Instance-tree assumptions need targeted verification.

## Verification

- Per phase: build clean and meet that phase's exit criteria.
- Prefer phase-local tests plus the relevant package test command instead of treating the whole old monolithic tracker as one unit.

## How To Use

1. Open the lowest unfinished phase file.
2. Update only that phase file while the work is active.
3. Keep shared assumptions in this index, not copied into every phase file.
4. Use the root [PLAN.md](/Users/reikan404/Documents/rovy/PLAN.md) only as a compatibility pointer.
