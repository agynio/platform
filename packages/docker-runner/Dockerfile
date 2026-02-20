# syntax=docker/dockerfile:1.7

FROM node:20-slim AS base

ENV PNPM_HOME=/pnpm \
    PNPM_STORE_PATH=/pnpm-store \
    PATH=/pnpm:$PATH

RUN corepack enable \
 && corepack prepare pnpm@10.5.0 --activate

RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

RUN pnpm fetch

FROM base AS build

COPY . .

# Avoid workspace-wide postinstall/prepare (platform-server runs prisma generate)
RUN pnpm install --filter @agyn/docker-runner... --offline --frozen-lockfile --ignore-scripts

RUN pnpm --filter @agyn/docker-runner run build

RUN pnpm deploy --filter @agyn/docker-runner --prod --legacy /opt/app

FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=7071

WORKDIR /opt/app/packages/docker-runner

RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /opt/app /opt/app

USER node

EXPOSE 7071

CMD ["node", "dist/service/main.js"]
