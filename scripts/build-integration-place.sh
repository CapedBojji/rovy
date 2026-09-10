#!/usr/bin/env bash
# Compile the integration place and build the .rbxl, without running Studio.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
place_dir="$repo_root/test/place"
build_dir="$place_dir/.build"

pnpm --filter @rovy/core build
pnpm --filter @rovy/datastore build
pnpm --filter @rovy/ui build
pnpm --filter @rovy/integration-place build

rojo_bin="$(command -v rojo || true)"
if [ -z "$rojo_bin" ]; then
  tool_dir="$(cd "$repo_root" && mise where github:rojo-rbx/rojo@7.6.1 2>/dev/null || true)"
  rojo_bin="$tool_dir/rojo"
fi

mkdir -p "$build_dir"
"$rojo_bin" build "$place_dir/default.project.json" -o "$build_dir/rovy-integration.rbxl"
