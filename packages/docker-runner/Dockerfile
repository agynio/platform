# syntax=docker/dockerfile:1.7

FROM node:20-slim AS base

ENV PNPM_HOME=/pnpm \
    PNPM_STORE_PATH=/pnpm-store \
    PATH=/pnpm:$PATH

RUN corepack enable \
 && corepack prepare pnpm@10.5.0 --activate

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    autoconf \
    automake \
    build-essential \
    cmake \
    curl \
    git \
    libtool \
    m4 \
    ninja-build \
    perl \
    pkg-config \
    python3 \
    unzip \
    zip \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

RUN pnpm fetch

FROM base AS build

COPY . .

RUN pnpm install \
    --filter @agyn/docker-runner... \
    --filter @agyn/platform-server \
    --offline --frozen-lockfile

RUN pnpm --filter @agyn/docker-runner run build

RUN pnpm deploy --filter @agyn/docker-runner --prod --legacy /opt/app/packages/docker-runner

FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=7071 \
    NODE_OPTIONS=--experimental-specifier-resolution=node

WORKDIR /opt/app/packages/docker-runner

RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /opt/app /opt/app

USER node

EXPOSE 7071

CMD ["node", "dist/service/main.js"]
