#!/usr/bin/env sh
set -eu

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
