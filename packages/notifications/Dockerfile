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

RUN pnpm install --filter @agyn/notifications... --offline --frozen-lockfile

RUN pnpm --filter @agyn/notifications run build

RUN pnpm deploy --filter @agyn/notifications --prod --legacy /opt/app \
 && rm -rf /opt/app/packages/notifications \
 && mkdir -p /opt/app/packages/notifications \
 && cp -R packages/notifications/. /opt/app/packages/notifications/

FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /opt/app/packages/notifications

RUN corepack enable \
 && corepack prepare pnpm@10.5.0 --activate \
 && apt-get update \
 && apt-get install -y --no-install-recommends git openssl \
 && npm install --global tsx@^4.20.5 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /opt/app /opt/app

EXPOSE 4000

USER node

CMD ["tsx", "src/index.ts"]
