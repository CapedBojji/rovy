#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLEAN_MODULES=false

for arg in "$@"; do
  case "$arg" in
    --modules|-m) CLEAN_MODULES=true ;;
    --help|-h)
      echo "Usage: clean.sh [--modules|-m]"
      echo "  Default: removes all out/, build/, dist/ folders"
      echo "  --modules|-m: also removes all node_modules/"
      exit 0
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

BUILD_DIRS=(
  "$ROOT/build"
  "$ROOT/packages/core/out"
  "$ROOT/packages/networking/out"
  "$ROOT/packages/ui/out"
  "$ROOT/packages/transformer/dist"
  "$ROOT/examples/plugin-example/out"
  "$ROOT/examples/roblox-ts-game/out"
  "$ROOT/examples/roblox-ts-game/build"
  "$ROOT/examples/ui-inventory-game/out"
  "$ROOT/examples/zombie-game/out"
  "$ROOT/examples/zombie-game/build"
)

for dir in "${BUILD_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    echo "rm $dir"
    rm -rf "$dir"
  fi
done

if $CLEAN_MODULES; then
  while IFS= read -r dir; do
    # skip nested node_modules inside node_modules
    [[ "$dir" == */node_modules/*/node_modules ]] && continue
    echo "rm $dir"
    rm -rf "$dir"
  done < <(find "$ROOT" -maxdepth 4 -name "node_modules" -type d -prune)
fi

echo "Done."
