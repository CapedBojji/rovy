#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
vendor_dir="$(cd "$script_dir/../../../.." && pwd)/vendor/scribe"

if [[ ! -f "$vendor_dir/UPSTREAM.md" ]]; then
	echo "Vendored Scribe is missing at $vendor_dir" >&2
	exit 1
fi

(
	cd "$vendor_dir"
	observed_files="$(mktemp)"
	recorded_files="$(mktemp)"
	trap 'rm -f "$observed_files" "$recorded_files"' EXIT

	find . -type f \
		! -name UPSTREAM.md \
		! -name SHA256SUMS \
		-print \
		| sed 's#^\./##' \
		| LC_ALL=C sort > "$observed_files"
	sed 's/^[0-9a-f]*  //' SHA256SUMS \
		| LC_ALL=C sort > "$recorded_files"
	if ! diff -u "$recorded_files" "$observed_files"; then
		echo "Vendored Scribe file list differs from SHA256SUMS" >&2
		exit 1
	fi

	shasum -a 256 -c SHA256SUMS
)

echo "$vendor_dir"
