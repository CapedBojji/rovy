#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: run-roblox-test.sh <rojo-project> <place-output> <runner-script>" >&2
  exit 2
fi

project="$1"
place="$2"
runner="$3"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

tool_path() {
  local name="$1"
  local mise_spec="$2"
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi

  local tool_dir
  tool_dir="$(cd "$repo_root" && mise where "$mise_spec" 2>/dev/null || true)"
  if [ -n "$tool_dir" ] && [ -f "$tool_dir/$name" ]; then
    printf '%s/%s\n' "$tool_dir" "$name"
    return 0
  fi

  echo "missing required tool: $name" >&2
  return 1
}

rojo_bin="$(tool_path rojo github:rojo-rbx/rojo@7.6.1)"
run_in_roblox_bin="$(tool_path run-in-roblox github:rojo-rbx/run-in-roblox@0.3.0)"
chmod +x "$run_in_roblox_bin" 2>/dev/null || true

mkdir -p "$(dirname "$place")"
"$rojo_bin" build "$project" -o "$place"
"$run_in_roblox_bin" --place "$place" --script "$runner"
