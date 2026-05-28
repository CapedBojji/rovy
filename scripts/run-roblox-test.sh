#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: run-roblox-test.sh <rojo-project> <place-output> <runner-script>" >&2
  exit 2
fi

project="$1"
place="$2"
runner="$3"

run_in_roblox_dir="$(mise where github:rojo-rbx/run-in-roblox@0.3.0 2>/dev/null || true)"
if [ -n "$run_in_roblox_dir" ] && [ -f "$run_in_roblox_dir/run-in-roblox" ]; then
  chmod +x "$run_in_roblox_dir/run-in-roblox" 2>/dev/null || true
fi

mkdir -p "$(dirname "$place")"
mise x -- rojo build "$project" -o "$place"
mise x -- run-in-roblox --place "$place" --script "$runner"
