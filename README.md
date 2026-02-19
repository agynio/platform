> [!NOTE]
> Quick setup: use the Bootstrap repo to run prebuilt Platform Server and UI images locally — https://github.com/agynio/bootstrap

# Agyn Platform
A multi-service agents platform with a NestJS API, React UI, and filesystem-backed graph orchestration.

## Results on SWE-bench Verified
Using a coordinated multi-agent team, agyn achieved **72.2% fully automated issue resolution** on SWE-bench Verified, the highest result among GPT-5–based systems.

Full paper: https://arxiv.org/pdf/2602.01465

## Overview
Agyn Platform is a TypeScript monorepo that provides:
- A Fastify/NestJS server exposing HTTP and Socket.IO APIs for agent graphs, runs, context items, and persistence.
- A Vite/React frontend for building and operating agent graphs visually.
- Local operational components via Docker Compose: Postgres databases, LiteLLM, Vault, a Nix cache proxy (NCPS), and observability (Prometheus, Grafana, cAdvisor).

Intended use cases:
- Building agent graphs (nodes/edges) and storing them in a filesystem-backed graph dataset.
- Running, monitoring, and persisting agent interactions and tool executions.
- Integrating with LLM providers (LiteLLM or OpenAI) while tracking context/history.
- Operating a local development environment with supporting infra.

## Repository Structure
- docker-compose.yml — Third-party development infra: Postgres, agents-db, Vault (+ auto-init), NCPS, LiteLLM, OpenZiti, Prometheus, Grafana, etc.
- docker-compose.dev.yml — Optional overlay that builds/runs the platform-server and docker-runner containers against the infra stack.
- .github/workflows/
  - ci.yml — Linting, tests (server/UI), Storybook build + smoke, type-check build steps.
  - docker-ghcr.yml — Build and publish platform-server and platform-ui images to GHCR.
- packages/
  - platform-server/ — NestJS Fastify API and Socket.IO server
    - src/ — Application modules (bootstrap, graph, nodes, llm, infra, etc.)
    - prisma/ — Prisma schema and migrations (Postgres), uses AGENTS_DATABASE_URL
    - .env.example — Server env variables
    - Dockerfile — Multi-stage build; runs server with tsx
  - platform-ui/ — React + Vite SPA
    - src/ — UI source
    - .env.example — UI env variables (VITE_API_BASE_URL, etc.)
    - Dockerfile — Builds static assets; serves via nginx with API upstream templating
    - docker/entrypoint.sh, docker/nginx.conf.template — Runtime nginx config
  - llm/ — Internal library for LLM interactions (OpenAI client, zod).
  - shared/ — Shared types/helpers for UI/Server.
  - json-schema-to-zod/ — Internal helper library.
- docs/ — Platform documentation
  - README.md — Docs index
  - api/index.md — HTTP and socket API reference
  - config/, graph/, ui/, observability/, security/, etc. — Detailed technical docs
- monitoring/
  - prometheus/prometheus.yml — Scrape Prometheus and cAdvisor
  - grafana/provisioning/datasources/datasource.yml — Grafana Prometheus data source
- ops/
  - k8s/ncps/ — Example Service + ServiceMonitor manifests for NCPS
- vault/auto-init.sh — Dev-only Vault initialization and diagnostics script
- package.json — Workspace-level scripts and dependencies
- pnpm-workspace.yaml — Workspace globs
- vitest.config.ts — Root vitest configuration (packages/*)
- LICENSE — Apache 2.0 with Commons Clause + No-Hosting rider
- .prettierrc, eslint configs — Formatting/linting configurations

## Tech Stack
- Languages: TypeScript
- Backend:
  - NestJS 11 (@nestjs/common@^11.1), Fastify 5 (@nestjs/platform-fastify, fastify@^5.6.1)
  - Socket.IO 4.8 for server/client events
  - Prisma 6 (schema + migrations) with Postgres databases
- Frontend:
  - React 19, Vite 7, Tailwind CSS 4.1, Radix UI
  - Storybook 10 for component documentation
- LLM:
  - LiteLLM server (ghcr.io/berriai/litellm) or OpenAI (@langchain/* tooling)
- Tooling:
  - pnpm 10.5 (corepack-enabled), Node.js 20
  - Vitest 3 for testing; ESLint; Prettier
- Observability:
  - Prometheus, Grafana, cAdvisor
- Containers:
  - Docker Compose services (see docker-compose.yml)

Required versions:
- Node.js 20 (see .github/workflows/ci.yml and Dockerfiles)
- pnpm 10.5.0 (package.json, Dockerfiles)
- Postgres 16 (docker-compose.yml)

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 10.5 (corepack enable; corepack prepare pnpm@10.5.0)
- Docker Engine + Docker Compose plugin
- Git

Optional local services (provided in docker-compose.yml for dev):
- Postgres databases (postgres at 5442, agents-db at 5443)
- LiteLLM + Postgres (loopback port 4000)
- Vault (8200) with dev auto-init
- NCPS (Nix cache proxy) on 8501
- Prometheus (9090), Grafana (3000), cAdvisor (8080)

### Setup
1) Clone and install:
```bash
gh repo clone agynio/platform
cd platform
pnpm install
```

2) Configure environments:
- Server: copy packages/platform-server/.env.example to .env, then set:
  - AGENTS_DATABASE_URL (required) — e.g. postgresql://agents:agents@localhost:5443/agents
  - LLM_PROVIDER — litellm or openai (no default)
  - LITELLM_BASE_URL, LITELLM_MASTER_KEY (required for LiteLLM path)
  - Optional: CORS_ORIGINS, VAULT_* (see packages/platform-server/src/core/services/config.service.ts and .env.example)
- UI: copy packages/platform-ui/.env.example to .env and set:
  - VITE_API_BASE_URL — e.g. http://localhost:3010
  - Optional: VITE_UI_MOCK_SIDEBAR (shows mock templates locally)

3) Start dev supporting services:
```bash
docker compose up -d
# Starts postgres (5442), agents-db (5443), vault (8200), ncps (8501),
# litellm (127.0.0.1:4000), registry-mirror, and the OpenZiti controller stack
# Optional monitoring (prometheus/grafana) lives in docker-compose.monitoring.yml.
# Enable with: docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Optional: run platform-server and docker-runner inside Docker as well.
mkdir -p .ziti/identities .ziti/tmp data/graph
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d platform-server docker-runner
# The overlay builds local images and reuses the infra services defined in docker-compose.yml.
```

4) Apply server migrations and generate Prisma client:
```bash
# set your AGENTS_DATABASE_URL appropriately
export AGENTS_DATABASE_URL=postgresql://agents:agents@localhost:5443/agents
pnpm --filter @agyn/platform-server exec prisma migrate deploy
pnpm --filter @agyn/platform-server run prisma:generate
```

### Run

- Development:
```bash
# Backend
pnpm --filter @agyn/platform-server dev
# UI (Vite dev server)
pnpm --filter @agyn/platform-ui dev
# docker-runner (Fastify dev server)
pnpm --filter @agyn/docker-runner dev
```
> Prefer containers? Use `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d platform-server docker-runner`
> after the infra stack is running. The overlay file builds the local images against the
> same Postgres/LiteLLM/Vault/Ziti services.
Server listens on PORT (default 3010; see packages/platform-server/src/index.ts and Dockerfile), UI dev server on default Vite port.

The docker-runner dev script automatically loads the first `.env` it finds (prefers repo root, falls back to packages/docker-runner) when `NODE_ENV` is not `production`. Production `pnpm start` keeps relying solely on the surrounding environment, so missing `.env` files do not crash the process.

- Production (Docker):
  - Use published images from GHCR (see .github/workflows/docker-ghcr.yml):
    - ghcr.io/agynio/platform-server
    - ghcr.io/agynio/platform-ui
  - Example: server (env must include AGENTS_DATABASE_URL, LLM_PROVIDER, LITELLM_BASE_URL, LITELLM_MASTER_KEY):
```bash
docker run --rm -p 3010:3010 \
  -e AGENTS_DATABASE_URL=postgresql://agents:agents@host.docker.internal:5443/agents \
  -e LLM_PROVIDER=litellm \
  -e LITELLM_BASE_URL=http://host.docker.internal:4000 \
  -e LITELLM_MASTER_KEY=sk-dev-master-1234 \
  ghcr.io/agynio/platform-server:latest
```
  - Example: UI (configure API upstream via API_UPSTREAM):
```bash
docker run --rm -p 8080:80 \
  -e API_UPSTREAM=http://host.docker.internal:3010 \
  ghcr.io/agynio/platform-ui:latest
```

### Secure docker-runner connectivity (OpenZiti)

The dev stack now ships an OpenZiti controller, initializer, and edge router. To route docker-runner traffic through the
overlay instead of the Docker bridge network:

1. Approve the OpenZiti SDK build step (`pnpm approve-builds` → select `@openziti/ziti-sdk-nodejs`).
2. Enable `ZITI_ENABLED=true` plus the related settings in `packages/platform-server/.env` and
   `packages/docker-runner/.env` (paths default to `./.ziti/identities/...`).
3. Start the controller stack: `docker compose up -d ziti-controller ziti-controller-init ziti-edge-router`.
4. Launch docker-runner and platform-server normally (either via `pnpm dev` or
   `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d platform-server docker-runner`).
   The server will reconcile the controller, enroll identities, and expose a local proxy on `0.0.0.0:17071`
   (typically accessed via `127.0.0.1`) for all docker-runner calls.

See [docs/containers/ziti.md](docs/containers/ziti.md) for the full walkthrough and smoke test commands.

## Configuration

Key environment variables (server) from packages/platform-server/.env.example and src/core/services/config.service.ts:
- Required:
  - AGENTS_DATABASE_URL — Postgres connection for platform-server
  - LLM_PROVIDER — litellm or openai
  - LITELLM_BASE_URL — LiteLLM root URL (must not include /v1; default host in docker-compose is 127.0.0.1:4000)
  - LITELLM_MASTER_KEY — admin key for LiteLLM
- Optional LLM:
  - OPENAI_API_KEY, OPENAI_BASE_URL
- Graph store:
  - GRAPH_REPO_PATH (default ./data/graph)
  - GRAPH_BRANCH (default main)
  - GRAPH_AUTHOR_NAME, GRAPH_AUTHOR_EMAIL (deprecated; retained for compatibility)
  - GRAPH_LOCK_TIMEOUT_MS (default 5000)
- Vault:
  - VAULT_ENABLED (default false), VAULT_ADDR (default http://localhost:8200), VAULT_TOKEN (default dev-root)
- Workspace/Docker:
  - WORKSPACE_NETWORK_NAME (default agents_net)
  - DOCKER_MIRROR_URL (default http://registry-mirror:5000)
  - DOCKER_RUNNER_BASE_URL (required; default http://docker-runner:7071)
  - DOCKER_RUNNER_SHARED_SECRET (required HMAC credential)
  - DOCKER_RUNNER_TIMEOUT_MS (optional request timeout; default 30000)
- OpenZiti (optional secure docker-runner tunnel):
  - ZITI_ENABLED (default false) — enable controller reconciliation + proxy
  - ZITI_MANAGEMENT_URL / ZITI_USERNAME / ZITI_PASSWORD — controller credentials
  - ZITI_SERVICE_NAME / ZITI_ROUTER_NAME — service plus edge router handles
  - ZITI_PLATFORM_IDENTITY_FILE / ZITI_RUNNER_IDENTITY_FILE — identity output paths under `./.ziti/`
  - ZITI_RUNNER_PROXY_PORT (default 17071) — local HTTP proxy for docker-runner calls
- Nix/NCPS:
  - NCPS_ENABLED (default false)
  - NCPS_URL_SERVER, NCPS_URL_CONTAINER (default http://ncps:8501)
  - NCPS_PUBKEY_PATH (default /pubkey), fetch/refresh/backoff settings
  - NIX_ALLOWED_CHANNELS, NIX_* cache limits
- CORS:
  - CORS_ORIGINS — comma-separated allowed origins
- Misc:
  - MCP_TOOLS_STALE_TIMEOUT_MS (default 0)
  - LOG_LEVEL (used in pino http logger; see packages/platform-server/src/bootstrap/app.module.ts)
- Server PORT:
  - PORT (default 3010; see packages/platform-server/Dockerfile and src/index.ts)

UI variables (packages/platform-ui/.env.example):
- VITE_API_BASE_URL — Base URL for API (no /api suffix)
- VITE_UI_MOCK_SIDEBAR — true to show mock templates locally
- Note: the UI derives tracing requests from `VITE_API_BASE_URL`; no separate tracing URL override is consumed at runtime.

## Services / Processes
- @agyn/platform-server — NestJS Fastify API + Socket.IO gateway
  - Entrypoint: packages/platform-server/src/index.ts
  - Ports: 3010 (default)
- @agyn/platform-ui — React/Vite SPA
  - Dev port: Vite default (e.g., 5173)
  - Docker runtime: nginx on port 80; upstream set via API_UPSTREAM
- Supporting via docker-compose.yml:
  - postgres — general Postgres (5442)
  - agents-db — dedicated Postgres for server persistence (5443)
  - vault — HashiCorp Vault (8200), auto-init helper vault-auto-init
  - ncps — Nix cache proxy (8501)
  - litellm + litellm-db — LLM proxy with UI (4000 loopback)
  - Optional monitoring overlay (docker-compose.monitoring.yml) adds prometheus (9090) and grafana (3000) without mounting the Docker socket; provide your own scrape targets via configuration.
- In-repo services (platform-server, docker-runner) live in docker-compose.dev.yml and must be combined with the base file.

To start services:
```bash
docker compose up -d
```

## Data Layer
- Database: Postgres (packages/platform-server/prisma/schema.prisma)
- ORM: Prisma 6
- Migrations: packages/platform-server/prisma/migrations/*
- Models include threads, runs, messages, events, context items, container tracking, reminders, etc.
- Commands:
```bash
# Apply migrations and generate client
export AGENTS_DATABASE_URL=postgresql://agents:agents@localhost:5443/agents
pnpm --filter @agyn/platform-server exec prisma migrate deploy
pnpm --filter @agyn/platform-server run prisma:generate
```

## Testing, Linting, Formatting
- Test runner: Vitest
  - Root: vitest.config.ts looks for **/__tests__/**/*.test.ts under packages/*
  - Server tests: pnpm --filter @agyn/platform-server test
  - UI tests: pnpm --filter @agyn/platform-ui test
  - UI socket e2e: pnpm --filter @agyn/platform-ui run test:e2e (requires VITE_API_BASE_URL)
- Lint: pnpm -r run lint (workspace recursive; see package.json and eslint configs)
- Type-check:
  - Server: pnpm --filter @agyn/platform-server run typecheck
  - UI: pnpm --filter @agyn/platform-ui run typecheck
- Storybook:
  - Dev: pnpm --filter @agyn/platform-ui storybook
  - Build: pnpm --filter @agyn/platform-ui build-storybook
  - Smoke tests: pnpm --filter @agyn/platform-ui storybook:test
- Formatting: Prettier (.prettierrc)

## CI/CD
- GitHub Actions: .github/workflows/ci.yml
  - lint — pnpm install, type-check server, lint recursively
  - test-server — spins Postgres service, applies migrations, runs server tests
  - test-ui — installs deps, runs UI tests and socket e2e tests (needs VITE_API_BASE_URL), type-check
  - storybook-smoke — builds Storybook and runs smoke tests with Playwright
  - build-server — type-check server (noEmit)
  - build-ui — pnpm -r build (topological)
- Docker images: .github/workflows/docker-ghcr.yml
  - Builds and publishes platform-server and platform-ui to GHCR (multi-arch on main/tags)
  - Tags: sha-*, latest (main), semver tags for releases

## API Docs
- See docs/api/index.md for current HTTP and socket endpoints:
  - /api/templates, /api/graph, /graph/templates, /graph/nodes/:nodeId/status, /api/agents/runs/:runId/events, /api/agents/context-items, dynamic-config schema, Vault proxy routes, Nix proxy routes, socket events.
- No OpenAPI/Swagger spec checked in; discover via docs/api/index.md and controllers under packages/platform-server/src/graph/ (GraphApiModule wiring).

## Deployment
- Local compose: docker-compose.yml includes all supporting services required for dev workflows.
- Server container:
  - Image: ghcr.io/agynio/platform-server
  - Required env: AGENTS_DATABASE_URL, LLM_PROVIDER, LITELLM_BASE_URL, LITELLM_MASTER_KEY, optional Vault and CORS
  - Exposes 3010; healthcheck verifies TCP connectivity
- UI container:
  - Image: ghcr.io/agynio/platform-ui
  - Env: API_UPSTREAM (default http://localhost:3010)
  - Serves static frontend on port 80 via nginx; proxies /api and /socket.io to upstream
- Kubernetes (example for NCPS) provided under ops/k8s/ncps

Secrets handling:
- Vault auto-init script under vault/auto-init.sh is dev-only; do not use in production.
- Never commit secrets; use environment injection and secure secret managers.

## Observability / Logging / Metrics
- Server logging: nestjs-pino with redaction of sensitive headers (packages/platform-server/src/bootstrap/app.module.ts)
- Prometheus scrapes Prometheus and cAdvisor; Grafana is pre-provisioned (monitoring/)
- NCPS can expose metrics via /metrics (see ops/k8s/ncps and docker-compose service annotations)
- cAdvisor tracks container metrics; Prometheus retention 7d (docker-compose.yml)

## Troubleshooting
- AGENTS_DATABASE_URL missing or incorrect:
  - Symptom: server fails at startup or Prisma queries fail.
  - Fix: set a valid Postgres URL (see packages/platform-server/.env.example and docker-compose agents-db).
- LiteLLM not reachable:
  - Symptom: LLM calls error; provider set to litellm.
  - Fix: ensure litellm service running (127.0.0.1:4000 in compose), set LITELLM_BASE_URL and LITELLM_MASTER_KEY.
- CORS blocked in UI dev:
  - Symptom: browser CORS errors.
  - Fix: set CORS_ORIGINS in server .env to the UI origin; restart server.
- Prisma client errors:
  - Symptom: runtime complains about missing generated client.
  - Fix: run prisma:generate in platform-server.
- Port conflicts:
  - Symptom: services fail to bind.
  - Fix: adjust ports in docker-compose.yml or free the port.
- Docker network name mismatch:
  - Symptom: workspace containers cannot reach registry-mirror or ncps.
  - Fix: ensure WORKSPACE_NETWORK_NAME=agents_net or adjust compose network name.
- UI API upstream:
  - Symptom: UI cannot reach backend in Docker.
  - Fix: set API_UPSTREAM=http://host.docker.internal:3010 when running UI container locally.

## Contributing & License
- Contributing: see docs/contributing/ and docs/adr/ for architectural decisions.
- Code owners: CODEOWNERS file exists at repo root.
- License: Apache 2.0 with “Commons Clause” and a No‑Hosting/Managed Service rider (see LICENSE). You may not sell or host the software as a managed service where its primary value comes from the software itself.

---

### Notes / Assumptions
- No OpenAPI/Swagger spec in repo; endpoint discovery relies on docs/api/index.md and server controllers. If an OpenAPI document exists elsewhere, please add or link it.
- Production Vault: dev auto-init script (vault/auto-init.sh) is not suitable; confirm production secret management approach and policies.
- UI Storybook deployment: CI builds and smoke-tests Storybook, but no public hosting config is present. Confirm desired publishing workflow.
- NCPS in production: ops/k8s manifests are examples; confirm production deployment/monitoring design.
- Filesystem-backed graph store (GRAPH_REPO_PATH=./data/graph, GRAPH_BRANCH=main) assumes the path is writable and durable. Confirm persistence strategy in production (persistent volumes/NFS) and keep legacy git repos out of the configured path; the server now reads/writes directly to the working tree without migrations.
- Confirm whether the general postgres service (5442) is used by other components or is purely for convenience; server uses agents-db (5443).
