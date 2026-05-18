# Milestone 7 — UI Docs / Widget Model (Planned)

## ⬜ Phase 22 — Transformer contract docs for wrapped widgets

- [ ] Document planned transformer support for JSDoc `@widget` functions
- [ ] Document same-file implementation requirement
- [ ] Document widget registration injection for tagged functions
- [ ] Document widget wrapping through `RovyUi.__widget(...)`
- [ ] Document detection of calls to tagged widget functions
- [ ] Document lowering of `WidgetFn(args)` to the wrapped callable returned by `RovyUi.__widget(...)`
- [ ] Document `style: Style` param erasure and `RovyUi.getActiveStyle()` insertion
- [ ] Document callback-bounded `StyleScope({ patch, discriminator? }, fn)` lowering
- [ ] Document that style is runtime context, not widget registration metadata
- [ ] Document overloads as the preferred clean public signature pattern
- [ ] Document compile-time keys, if kept, as widget identity/metadata only
- [ ] Explicitly state no hook/state/effect lowering for UI
- [ ] **Exit:** docs lock the future widget transformer contract without implying implementation already exists
