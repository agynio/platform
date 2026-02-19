# syntax=docker/dockerfile:1.7

FROM node:20-slim AS base

ENV PNPM_HOME=/pnpm \
    PNPM_STORE_PATH=/pnpm-store \
    PATH=/pnpm:$PATH

RUN corepack enable \
 && corepack prepare pnpm@10.5.0 --activate

RUN apt-get update \
 && apt-get install -y --no-install-recommends git openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

RUN pnpm fetch

FROM base AS build

COPY . .

RUN pnpm install --filter @agyn/notifications-gateway... --offline --frozen-lockfile

RUN pnpm --filter @agyn/notifications-gateway run build

RUN pnpm deploy --filter @agyn/notifications-gateway --prod --legacy /opt/app

FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=3011

WORKDIR /opt/app/packages/notifications-gateway

RUN corepack enable \
 && corepack prepare pnpm@10.5.0 --activate \
 && apt-get update \
 && apt-get install -y --no-install-recommends git openssl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /opt/app /opt/app

EXPOSE 3011

USER node

CMD ["node", "dist/index.js"]
