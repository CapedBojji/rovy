# Milestone 7 — UI Docs / Widget Model (Planned)

## ⬜ Phase 22 — Transformer contract docs for widgets

- [ ] Document planned transformer support for JSDoc `@widget BuilderName`
- [ ] Document same-file builder resolution
- [ ] Document widget registration injection for builder classes
- [ ] Document detection of calls to tagged widget functions
- [ ] Document lowering of `WidgetFn(args)` into the future widget-runtime invocation surface
- [ ] Document that the builder owns required `build(...)` and may receive resources/queries/injected params
- [ ] Document that the returned function is passed through the future `useWidget(...)` path
- [ ] Document compile-time keys, if kept, as widget identity/metadata only
- [ ] **Exit:** docs lock the future widget transformer contract without implying implementation already exists

