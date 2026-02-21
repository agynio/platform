# Notifications gateway runbook

This runbook explains how to boot the end-to-end stack that fronts the platform
server with Envoy and exposes the Socket.IO endpoint via the standalone
`notifications-gateway` service.

## Components

- **Redis** – transports notification envelopes from the platform server to the
  Socket.IO gateway via the `notifications.v1` Pub/Sub channel.
- **Platform server** – publishes notifications to Redis and serves the REST
  API on port `3010`.
- **Notifications gateway** – subscribes to Redis and re-broadcasts envelopes
  to Socket.IO clients.
- **Envoy** – single ingress point that routes `/api/*` requests to the
  platform server and `/socket.io/*` to the gateway, exposing port `8080`.
- Supporting services: Postgres (`agents-db`), LiteLLM (`litellm`/`litellm-db`),
  and `docker-runner` for tool execution parity.

## Prerequisites

- Docker Engine 24+
- Compose v2 (`docker compose version`)
- Ports `8080`, `9901`, `4000`, `5443`, and `6379` available on the host

## Redis for local development

If you run the platform server or notifications gateway outside the full
Envoy/E2E stack, start the shared Redis dependency first:

```
docker compose up -d redis
```

The E2E compose file reuses the same service definition, so Redis does not need
separate configuration.

## Start the stack

```
docker compose -f docker-compose.e2e.yml up --build
```

The first build can take several minutes because both the platform server and
notifications gateway images are constructed from the local workspace. Once the
containers are healthy you can hit the stack via Envoy:

```
curl -s http://localhost:8080/api/health | jq
```

The Socket.IO endpoint is exposed on the same origin under `/socket.io`. Any UI
or client library that previously connected to the in-process gateway can now
point to `http://localhost:8080` and reuse the existing configuration.

## Dev-local Envoy bridge

To run the platform server on `:3010` and the notifications gateway on `:4000`
directly on your host while reusing a single origin, bring up Redis and Envoy
from the default compose file:

```
docker compose up -d redis envoy
```

Then run the application processes locally with Redis wiring:

```
# platform server
NOTIFICATIONS_REDIS_URL=redis://localhost:6379 \
NOTIFICATIONS_CHANNEL=notifications.v1 \
pnpm --filter @agyn/platform-server dev

# notifications gateway
NOTIFICATIONS_REDIS_URL=redis://localhost:6379 \
NOTIFICATIONS_CHANNEL=notifications.v1 \
pnpm --filter @agyn/notifications-gateway dev
```

Point the UI at Envoy so both REST and Socket.IO traffic share the same origin:

```
VITE_API_BASE_URL=http://localhost:8080
```

The compose-managed Envoy mounts `ops/envoy/envoy.dev.local.yaml` and already
includes `extra_hosts: ["host.docker.internal:host-gateway"]` for Linux hosts.
If you prefer to run Envoy manually:

```
docker run --rm --name envoy-dev \
  -p 8080:8080 \
  -p 9901:9901 \
  -v "$(pwd)/ops/envoy/envoy.dev.local.yaml:/etc/envoy/envoy.yaml:ro" \
  envoyproxy/envoy:v1.30-latest
```

## Troubleshooting & environment notes

- **Docker Compose v2 required** – The default stack relies on `tmpfs` mounts
  and the `host-gateway` extra host entry. Install the Docker Compose v2 plugin
  (`docker compose version` should report `v2.29.0` or newer). The legacy
  `docker-compose` binary will not work.
- **Remote Docker daemons** – Codespaces/CI setups that export
  `DOCKER_HOST=tcp://localhost:2375` cannot bind-mount files from this repo.
  In that environment Envoy will log `Unable to convert YAML as JSON` because
  `/etc/envoy/envoy.yaml` is replaced by an empty directory. Run the stack on a
  machine where the daemon can see the workspace, or bake the config into a
  volume/image.
- **pnpm/Node prerequisites** – Use Node 22 (`nix profile install
  nixpkgs#nodejs_22`) and enable Corepack so `pnpm@10.x` matches the lockfile
  (`corepack enable && corepack install pnpm@10.30.1`).
- **EMFILE watch limits** – When `pnpm --filter @agyn/notifications-gateway
  dev` exits with `EMFILE`, raise the limits first:

  ```
  ulimit -n 4096
  sudo sysctl fs.inotify.max_user_watches=524288
  ```

  Alternatively run the gateway via `pnpm --filter @agyn/notifications-gateway
  exec tsx src/index.ts` after a one-time `pnpm --filter
  @agyn/notifications-gateway build`.

## Shutdown and cleanup

Press `Ctrl+C` to stop the stack, then remove containers and volumes with:

```
docker compose -f docker-compose.e2e.yml down -v
```

This tears down Postgres/LiteLLM volumes so the next run starts from a clean
state.
