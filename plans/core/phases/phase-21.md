# Milestone 7 — UI Docs / Widget Model (Planned)

## ⬜ Phase 21 — UI package and widget model docs

- [ ] Add a dedicated UI spec doc describing a future `@rovy/ui` package
- [ ] Define `@rovy/ui` as a separate runtime package, parallel to `@rovy/networking`
- [ ] Define JSDoc `@widget BuilderName` on caller functions plus same-file `@widget` builders as the central authoring primitive
- [ ] Lock widget discovery to transformer-injected registration plus `rovy.loadPaths(...)`
- [ ] Lock plain-call widget authoring syntax: `Window(args)`
- [ ] Record that widgets should stay normal functions for editor/typechecker stability
- [ ] Record that `RovyUi.Window(...)` is not the primary public surface
- [ ] **Exit:** docs clearly describe same-file caller-to-builder widget authoring with auto-collection and plain-call authoring

