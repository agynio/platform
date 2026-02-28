# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages/notifications/package.json packages/notifications/
RUN pnpm install --filter @agyn/notifications --prod --frozen-lockfile

FROM deps AS build
COPY packages/notifications packages/notifications
RUN pnpm --filter @agyn/notifications build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/packages/notifications/dist dist
COPY packages/notifications/package.json package.json
CMD ["node", "dist/main.js"]
