# syntax=docker/dockerfile:1.7

FROM node:20-slim AS base

ENV PNPM_HOME=/pnpm \
    PNPM_STORE_PATH=/pnpm-store \
    PATH=/pnpm:$PATH

RUN corepack enable \
 && corepack prepare pnpm@10.5.0 --activate

WORKDIR /workspace

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

RUN pnpm fetch

FROM base AS build

ARG VITE_API_BASE_URL=/
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY . .

RUN pnpm install --filter @agyn/platform-ui... --offline --frozen-lockfile --ignore-scripts

RUN pnpm --filter @agyn/platform-ui build

FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache gettext

COPY packages/platform-ui/docker/nginx.conf.template /etc/nginx/templates/default.conf.template

COPY packages/platform-ui/docker/entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh

COPY --from=build /workspace/packages/platform-ui/dist /usr/share/nginx/html

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
