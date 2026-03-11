#!/usr/bin/env sh
set -eu

# Ensure pnpm is available via corepack (handles stale dev images where
# PNPM_HOME/PATH haven't been updated yet). Transitional shim until the
# dev image is rebuilt from the updated Dockerfile.dev.
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not on PATH, activating via corepack..."
  corepack enable --install-directory /usr/local/bin
  corepack prepare pnpm@10.5.0 --activate
fi

echo "=== DevSpace startup ==="

cd /opt/app/data

echo "Generating protobuf types..."
pnpm proto:generate

echo "Approving build scripts..."
pnpm approve-builds @prisma/client prisma esbuild @nestjs/core

echo "Installing dependencies..."
pnpm install --filter @agyn/platform-server... --frozen-lockfile

echo "Generating Prisma client..."
pnpm --filter @agyn/platform-server run prisma:generate

echo "Starting dev server (tsx watch)..."
exec pnpm --filter @agyn/platform-server dev
