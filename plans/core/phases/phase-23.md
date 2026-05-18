# Milestone 7 — UI Docs / Widget Model (Planned)

## ⬜ Phase 23 — Stateless rules and example planning

- [ ] Document explicit non-goals: no `useState`, no `useEffect`, no hook model
- [ ] Document that widgets are stateless and may not hold persistent widget-local app state as a public contract
- [ ] Document that changing behavior must come from args, active style context, commands, events, or explicit external stores
- [ ] Add future validation notes for transformer fixtures covering widget wrapping registration + lowered wrapped calls
- [ ] Add future validation notes for `style: Style` lowering and `StyleScope(...)` callback scoping
- [ ] Add example-planning notes for arg/style-driven dummy widget authoring without hooks
- [ ] Add negative examples for widget classes, `new Widget()`, and `RovyUi.Widget(...)` public authoring
- [ ] **Exit:** docs and trackers consistently describe a stateless widget system and its future proof points

---
