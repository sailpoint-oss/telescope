#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install

echo "Building runner binaries..."
bun run build.ts "$@"
