# Milestone 4 — Networking Package MVP (Phase 16)

## ✅ Phase 16 — Package extension params + `@rovy/networking` scaffold

- [x] Added net-neutral external injected param descriptors to `@rovy/core`: `{ kind: "external", id }`
- [x] Added `app.insertParam(id, value)` and scheduler/runtime resolution for package-owned injected params
- [x] Added core spec coverage for external param injection and missing-param errors
- [x] Added `packages/networking` as `@rovy/networking`
- [x] Added `netEvent`, `rovyNet.__netEvent`, `NetRuntime`, `NetClient`, `NetServer`, `NetEventContext`, `NetPlugin`, `NetId`
- [x] Transformer now recognizes `@netEvent` from `@rovy/networking`, emits both `rovy.__event(...)` and `rovyNet.__netEvent(...)`, and lowers `NetClient` / `NetServer` / `NetEventContext` params through external ids
- [x] Transformer generates Blink schema metadata strings for `@netEvent` constructor payloads, including Blink-required comma-separated struct fields
- [x] Added transformer Blink integration test that extracts generated `.blink` schema, runs real Blink CLI, and asserts client/server/types Luau outputs exist
- [x] **Exit:** `mise exec -- pnpm test`, `mise exec -- pnpm run test:integration`, and `mise exec -- pnpm run test:zombie` green


