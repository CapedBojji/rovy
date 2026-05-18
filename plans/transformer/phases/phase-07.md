### [ ] Phase 7 — Planned UI transformer contract

- [x] Detect JSDoc `@widget` on function declarations and `const x = widget(...)` declarations.
- [x] Require a same-file implementation for consumer-authored tagged functions.
- [x] Inject widget registry metadata for consumer-authored tagged functions.
- [x] Wrap consumer-authored tagged widget functions through `RovyUi.__widget(...)`.
- [x] Detect plain calls to tagged widget functions such as `Window(args)`.
- [x] Lower `WidgetFn(args)` to `RovyUi.__callWidget(widget, "module:key", [args])`.
- [x] Detect built-in `@rovy/ui` widgets via the `@widget` tag in the package `.d.ts` (resolved through the type checker, following re-export/alias chains) — no hardcoded `UI_WIDGET_EXPORTS` list.
- [x] Two-key model: widget identity key in `__widget(fn, { id })`, per-callsite key in `__callWidget(widget, "module:N", args)`.
- [x] Detect leading `style: Style` and erase it into `RovyUi.getActiveStyle()` in the lowered body.
- [x] Lower `StyleScope({ patch, discriminator? }, fn)` as callback-bounded runtime style context.
- [ ] Optionally attach stable compile-time widget identity metadata for widget reconciliation/debugging.
- [x] Explicit non-goal: no public widget-class construction path.
- [x] Explicit non-goal: no hook/state/effect transform work for UI.
