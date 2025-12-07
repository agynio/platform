# syntax=docker/dockerfile:1.7

FROM node:20-slim AS base

ENV PNPM_HOME=/pnpm \
    PNPM_STORE_PATH=/pnpm-store \
    PATH=/pnpm:$PATH

RUN corepack enable \
 && corepack prepare pnpm@10.5.0 --activate

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

RUN pnpm fetch

FROM base AS build

COPY . .

RUN pnpm install --filter @agyn/platform-server... --offline --frozen-lockfile

RUN pnpm --filter @agyn/platform-server run prisma:generate

RUN pnpm deploy --filter @agyn/platform-server --prod --legacy /opt/app

FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=3010

WORKDIR /opt/app/packages/platform-server

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && npm install --global tsx@4.20.5 \
 && npm install --global prisma@^6.18.0 \
 && npm cache clean --force \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /opt/app /opt/app
COPY --from=build --chown=node:node /workspace/packages/platform-server/src /opt/app/packages/platform-server/src
COPY --from=build --chown=node:node /workspace/packages/platform-server/package.json /opt/app/packages/platform-server/package.json
COPY --from=build --chown=node:node /workspace/packages/platform-server/prisma /opt/app/packages/platform-server/prisma

EXPOSE 3010

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "const net = require('node:net'); const port = Number(process.env.PORT) || 3010; const host = process.env.HEALTHCHECK_HOST || '127.0.0.1'; const socket = net.connect({ port, host }, () => { socket.end(); process.exit(0); }); socket.on('error', () => process.exit(1)); setTimeout(() => { socket.destroy(); process.exit(1); }, 2000);"

CMD ["tsx", "src/index.ts"]
