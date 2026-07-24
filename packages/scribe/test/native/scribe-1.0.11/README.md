# Pinned Scribe command fixture

`Server/Commands.luau` is copied without modification from:

- Repository: `https://github.com/ericplane/Scribe`
- Version: `v1.0.11`
- Commit: `4253d303f3ea9e70b362d9e1e498b805ac3a8d01`
- Source path: `src/Server/Commands.luau`

The fixture is test-only and proves that Rovy's asynchronous command bridge can
yield through the exact native Scribe `xpcall` dispatch path. It is not shipped
in the npm package. Scribe is MIT licensed; the applicable license text is in
`LICENSE`.
