#!/usr/bin/env bash
# Enforce minimum per-package statement coverage using coverage.out.
#
# Usage (from server/):
#   go test -race -coverprofile=coverage.out -covermode=atomic ./...
#   bash ../scripts/coverage-enforce-packages.sh
#
# Environment:
#   MIN_COVERAGE     default 95
#   COVERAGE_PROFILE path to profile, default ./coverage.out (relative to server/)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIN="${MIN_COVERAGE:-95}"
PROFILE="${COVERAGE_PROFILE:-coverage.out}"

cd "${ROOT_DIR}/server"
if [[ ! -f "$PROFILE" ]]; then
  echo "missing $PROFILE — run: go test -coverprofile=$PROFILE ./..." >&2
  exit 2
fi

exec python3 "${ROOT_DIR}/scripts/coverage-go-packages.py" "$PROFILE" --min-pct "$MIN"
