# Pinned Scribe command fixture

`Server/Commands.luau` is copied without modification from:

- Repository: `https://github.com/ericplane/Scribe`
- Version: `v2.3.0`
- Commit: `e3309e9debdce2d3571406c48ded89f728404795`
- Source path: `src/Server/Commands.luau`

The fixture is test-only and proves that Rovy's asynchronous command bridge can
yield through the exact native Scribe `xpcall` dispatch path. It is not shipped
in the npm package. Scribe is MIT licensed; the applicable license text is in
`LICENSE`.
