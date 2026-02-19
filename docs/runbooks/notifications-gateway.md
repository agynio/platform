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

## Shutdown and cleanup

Press `Ctrl+C` to stop the stack, then remove containers and volumes with:

```
docker compose -f docker-compose.e2e.yml down -v
```

This tears down Postgres/LiteLLM volumes so the next run starts from a clean
state.
