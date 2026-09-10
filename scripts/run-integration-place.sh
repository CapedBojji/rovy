#!/usr/bin/env bash
# Compile the Rovy integration place, build it with Rojo, and drive it inside a
# real Roblox Studio DataModel via run-in-roblox. Fails when any case fails.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
place_dir="$repo_root/test/place"
build_dir="$place_dir/.build"
place_file="$build_dir/rovy-integration-$(date +%Y%m%d-%H%M%S).rbxl"
export PLACE_FILE="$place_file"

# run-in-roblox 0.3.0 hardcodes /Applications/RobloxStudio.app/Contents/MacOS/
# RobloxStudio and offers no override. macOS installs Studio as "Roblox
# Studio.app" (with a space), and version managers move it elsewhere again, so
# fail with a usable message rather than a Rust panic.
if [ "$(uname)" = "Darwin" ] && [ ! -x "/Applications/RobloxStudio.app/Contents/MacOS/RobloxStudio" ]; then
  echo "run-in-roblox needs /Applications/RobloxStudio.app/Contents/MacOS/RobloxStudio" >&2
  echo "Studio is usually at '/Applications/Roblox Studio.app'. Symlink the bundle it" >&2
  echo "actually launches, for example:" >&2
  echo "  ln -s '/Applications/Roblox Studio.app' /Applications/RobloxStudio.app" >&2
  exit 2
fi

"$repo_root/scripts/build-integration-place.sh" >/dev/null

run_in_roblox_bin="$(command -v run-in-roblox || true)"
if [ -z "$run_in_roblox_bin" ]; then
  tool_dir="$(cd "$repo_root" && mise where github:rojo-rbx/run-in-roblox@0.3.0 2>/dev/null || true)"
  run_in_roblox_bin="$tool_dir/run-in-roblox"
fi
[ -x "$run_in_roblox_bin" ] || chmod +x "$run_in_roblox_bin" 2>/dev/null || true

output="$("$run_in_roblox_bin" --place "$place_file" --script "$place_dir/runner.luau" 2>&1)"
echo "$output"

# run-in-roblox exits 0 even when the driven script errors, so gate on the
# marker the runner prints only after every case passes.
if ! printf '%s' "$output" | grep -q "ROVY_INTEGRATION_OK"; then
  echo "integration place did not report success" >&2
  exit 1
fi
