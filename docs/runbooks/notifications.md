# Notifications service runbook

This runbook explains how to boot the end-to-end stack that exposes the
platform server (REST) and the standalone `notifications` service (Socket.IO + HTTP)
as separate endpoints for local parity with production.

## Components

- **Redis** – optional Pub/Sub transport used when fan-out from Redis is
  desired. The notifications service can run without Redis by disabling it via
  environment flags.
- **Platform server** – serves the REST API on port `3010` and publishes
  notifications over HTTP to the notifications service.
- **Notifications service** – exposes Socket.IO on port `4000`, accepts HTTP
  publish requests at `/internal/notifications/publish`, and (optionally)
  subscribes to Redis for legacy fan-out. CORS is controlled via the
  `CORS_ORIGIN` environment variable.
- Supporting services: Postgres (`agents-db`), LiteLLM (`litellm`/`litellm-db`),
  and `docker-runner` for tool execution parity.

## Prerequisites

- Docker Engine 24+
- Compose v2 (`docker compose version`)
- Ports `3010`, `4000`, `5443`, and `6379` available on the host

## Redis for local development

If you run the platform server or notifications service outside the full
e2e stack, start the shared Redis dependency first:

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
notifications service images are constructed from the local workspace. Once the
containers are healthy you can hit the stack directly:

```
curl -s http://localhost:3010/api/health | jq
```

### Configure UI endpoints

- **Local development**: run `pnpm --filter @agyn/platform-ui dev` with
  `VITE_API_BASE_URL=http://localhost:3010` and
  `VITE_SOCKET_BASE_URL=http://localhost:4000`. REST traffic flows to
  platform-server while websocket events flow to the notifications service.
- **Production example**: point `VITE_API_BASE_URL` at your gateway/API host
  (e.g., `https://api.agents.example.com`) and `VITE_SOCKET_BASE_URL` at the
  websocket origin (e.g., `https://notifications.agents.example.com`). Both
  endpoints must expose `/socket.io` with websocket transport enabled.

### Verify websocket fan-out

1. Start the stack as shown above.
2. Connect a socket client to the notifications service:

   ```bash
   node <<'EOF'
   import { io } from 'socket.io-client';
   const socket = io('http://localhost:4000', { path: '/socket.io', transports: ['websocket'] });
   socket.on('connect', () => console.log('connected', socket.id));
   socket.emit('subscribe', { rooms: ['thread:demo'] }, (ack) => console.log('ack', ack));
   socket.on('run_status_changed', (payload) => {
     console.log('received', payload);
     process.exit(0);
   });
   EOF
   ```

3. From another terminal publish a notification via the HTTP endpoint:

   ```bash
   curl -s -X POST http://localhost:4000/internal/notifications/publish \
     -H 'content-type: application/json' \
     -d '{
       "event": "run_status_changed",
       "rooms": ["thread:demo"],
       "payload": {"threadId": "demo", "run": {"id": "run-1", "status": "running"}},
       "traceId": "local-demo"
     }'
   ```

4. The connected client should print the payload, proving that the platform-server →
   notifications service → UI path is healthy.

Automated coverage for this flow ships with the repository via
`packages/notifications/src/gateway.e2e.test.ts` and can be executed
with:

```
pnpm --filter @agyn/notifications test gateway.e2e.test.ts
```

## Troubleshooting & environment notes

- **Docker Compose v2 required** – The default stack relies on `tmpfs` mounts
  and the `host-gateway` extra host entry. Install the Docker Compose v2 plugin
  (`docker compose version` should report `v2.29.0` or newer). The legacy
  `docker-compose` binary will not work.
- **pnpm/Node prerequisites** – Use Node 22 (`nix profile install
  nixpkgs#nodejs_22`) and enable Corepack so `pnpm@10.x` matches the lockfile
  (`corepack enable && corepack install pnpm@10.30.1`).
- **EMFILE watch limits** – When `pnpm --filter @agyn/notifications
  dev` exits with `EMFILE`, raise the limits first:

  ```
  ulimit -n 4096
  sudo sysctl fs.inotify.max_user_watches=524288
  ```

  Alternatively run the service via `pnpm --filter @agyn/notifications
  exec tsx src/index.ts` after a one-time `pnpm --filter
  @agyn/notifications build`.

## Shutdown and cleanup

Press `Ctrl+C` to stop the stack, then remove containers and volumes with:

```
docker compose -f docker-compose.e2e.yml down -v
```

This tears down Postgres/LiteLLM volumes so the next run starts from a clean
state.
