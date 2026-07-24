#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
native_dir="$script_dir/.native/Scribe"
expected_commit="4253d303f3ea9e70b362d9e1e498b805ac3a8d01"

if [[ ! -d "$native_dir/.git" ]]; then
	mkdir -p "$script_dir/.native"
	git clone --filter=blob:none --branch v1.0.11 \
		https://github.com/ericplane/Scribe.git "$native_dir"
fi

actual_commit="$(git -C "$native_dir" rev-parse HEAD)"
if [[ "$actual_commit" != "$expected_commit" ]]; then
	echo "Scribe Studio fixture is at $actual_commit; expected $expected_commit" >&2
	exit 1
fi

echo "$native_dir"
