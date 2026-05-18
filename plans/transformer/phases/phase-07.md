### [ ] Phase 7 — Planned UI transformer contract

- [ ] Detect JSDoc `@widget BuilderName` on function declarations/exports.
- [ ] Resolve the named builder in the same file only.
- [ ] Scan `@widget` builder classes during the existing prepass.
- [ ] Inject widget registry metadata for builder classes.
- [ ] Detect plain calls to tagged widget functions such as `Window(args)`.
- [ ] Lower `WidgetFn(args)` into the future widget-runtime invocation surface.
- [ ] Optionally attach stable compile-time widget identity metadata for widget reconciliation/debugging.
- [ ] Explicit non-goal: no hook/state/effect transform work for UI.

