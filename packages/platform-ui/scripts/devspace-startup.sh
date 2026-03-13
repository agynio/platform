#!/usr/bin/env bash
set -eu

echo "=== DevSpace startup (platform-ui) ==="

echo "Installing dependencies..."
pnpm install --filter @agyn/platform-ui... --frozen-lockfile --ignore-scripts

echo "Starting Vite dev server on 0.0.0.0:3000..."
exec pnpm --filter @agyn/platform-ui exec vite --host 0.0.0.0 --port 3000
