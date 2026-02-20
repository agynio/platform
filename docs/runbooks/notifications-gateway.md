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

When you run the platform server on `:3010` and the notifications gateway on
`:4000` directly on your host, you can still terminate everything behind a
single origin by running Envoy in a standalone container:

```
docker run --rm --name envoy-dev \
  -p 8080:8080 \
  -p 9901:9901 \
  -v "$(pwd)/ops/envoy/envoy.dev.local.yaml:/etc/envoy/envoy.yaml:ro" \
  envoyproxy/envoy:v1.31-latest
```

This configuration forwards `/socket.io` upgrades to
`host.docker.internal:4000` (the notifications gateway) with a one-hour idle
timeout and `/api` traffic to `host.docker.internal:3010` (the platform server).

> [!NOTE]
> On Linux, `host.docker.internal` is not created automatically. If you prefer
> to manage the Envoy sidecar through Compose, add
> `extra_hosts: ["host.docker.internal:host-gateway"]` to the service so the
> container can resolve the host network address.

Point the UI (Vite dev server or production build) at Envoy via:

```
VITE_API_BASE_URL=http://localhost:8080
```

## Shutdown and cleanup

Press `Ctrl+C` to stop the stack, then remove containers and volumes with:

```
docker compose -f docker-compose.e2e.yml down -v
```

This tears down Postgres/LiteLLM volumes so the next run starts from a clean
state.
