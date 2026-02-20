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

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

RUN pnpm fetch

FROM base AS build

COPY . .

# Avoid workspace-wide postinstall/prepare (platform-server runs prisma generate)
RUN pnpm install \
    --filter @agyn/docker-runner... \
    --filter @agyn/platform-server \
    --offline --frozen-lockfile --ignore-scripts

RUN pnpm config set allow-scripts @openziti/ziti-sdk-nodejs \
 && pnpm rebuild @openziti/ziti-sdk-nodejs --config.ignore-scripts=false

RUN pnpm --filter @agyn/docker-runner run build

# pnpm deploy copies workspace deps and re-runs postinstall/prepare; skip scripts
RUN PNPM_SKIP_POSTINSTALL=1 PNPM_SKIP_PREPARE=1 npm_config_ignore_scripts=true \
    pnpm deploy --filter @agyn/docker-runner --prod --legacy /opt/app

RUN mkdir -p /opt/app/packages/docker-runner/dist \
 && cp -a /workspace/packages/docker-runner/dist/. /opt/app/packages/docker-runner/dist/

RUN ZITI_SDK_DIR=$(node -e "const path=require('path');const base=require.resolve('@openziti/ziti-sdk-nodejs/package.json',{paths:['/opt/app/packages/docker-runner']});process.stdout.write(path.dirname(base));") \
 && cd "$ZITI_SDK_DIR" \
 && ./node_modules/.bin/node-pre-gyp install

RUN cd /opt/app/packages/docker-runner \
 && node -e "require('@openziti/ziti-sdk-nodejs')"

FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=7071 \
    NODE_OPTIONS=--experimental-specifier-resolution=node

WORKDIR /opt/app/packages/docker-runner

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl git openssl \
 && npm install --global tsx@^4.20.5 \
 && npm cache clean --force \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /opt/app /opt/app

USER node

EXPOSE 7071

CMD ["node", "dist/service/main.js"]
