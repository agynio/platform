# OpenZiti integration

The local development stack now provisions an OpenZiti controller, initializer, and edge router. The platform-server
reconciles controller state at startup (service, policies, and identities) and stores identity material under
`./.ziti/identities`. A lightweight local HTTP proxy (`127.0.0.1:17071`) tunnels docker-runner traffic through the
OpenZiti overlay instead of the Docker bridge network when enabled.

## Prerequisites

1. Install dependencies and explicitly allow the OpenZiti SDK build step (pnpm blocks install scripts by default):

```bash
pnpm approve-builds
# Select @openziti/ziti-sdk-nodejs and confirm
```

> If interactive approvals are not available you can run the install script once manually:
>
> ```bash
> pnpm --dir node_modules/.pnpm/@openziti+ziti-sdk-nodejs@0.27.0/node_modules/@openziti/ziti-sdk-nodejs run install
> ```

2. Ensure the dev stack is running:

```bash
docker compose up -d ziti-controller ziti-controller-init ziti-edge-router
```

3. Copy `.env` files and enable OpenZiti flags:

- `packages/platform-server/.env`

```
ZITI_ENABLED=true
ZITI_MANAGEMENT_URL=https://ziti-controller:1280/edge/management/v1
ZITI_USERNAME=admin
ZITI_PASSWORD=admin
ZITI_INSECURE_TLS=true
ZITI_SERVICE_NAME=dev.agyn-platform.platform-api
ZITI_ROUTER_NAME=dev-edge-router
ZITI_PLATFORM_IDENTITY_FILE=./.ziti/identities/dev.agyn-platform.platform-server.json
ZITI_RUNNER_IDENTITY_FILE=./.ziti/identities/dev.agyn-platform.docker-runner.json
```

- `packages/docker-runner/.env` (or container env)

```
ZITI_ENABLED=true
ZITI_IDENTITY_FILE=./.ziti/identities/dev.agyn-platform.docker-runner.json
ZITI_SERVICE_NAME=dev.agyn-platform.platform-api
```

The docker-compose service already mounts `./.ziti` into both platform-server and docker-runner containers. Local
development outside Docker can re-use the same paths.

## Runtime flow

1. Platform-server bootstraps the controller via the Ziti Management API:
   - Creates/updates the service (`dev.agyn-platform.platform-api`).
   - Ensures bind/dial service policies and a service-edge-router policy targeting `dev-edge-router`.
   - Creates device identities for the server (`component.platform-server`) and docker-runner (`component.docker-runner`).
   - Generates OTT enrollments and writes identities to `.ziti/identities/`.
2. Ziti runner proxy starts on `127.0.0.1:17071` and dials the service using the platform-server identity. All requests to
   docker-runner are routed through this proxy when `ZITI_ENABLED=true`.
3. Docker-runner continues to listen on the configured TCP port (default `7071`) and now exposes the same API via an
   OpenZiti Express listener that proxies traffic to the local Fastify server.

## Smoke test

After both services start with `ZITI_ENABLED=true`:

1. Verify the local proxy is healthy (platform-server side):

```bash
curl http://127.0.0.1:17071/v1/ready
```

Expected response:

```json
{"status":"ready"}
```

2. Confirm docker-runner bridged the OpenZiti ingress:

```bash
docker logs docker-runner | grep "Ziti ingress ready"
```

Seeing the readiness log after step 1 indicates the end-to-end tunnel is operational.

> To reset the environment delete `./.ziti/identities` and `./.ziti/tmp`, then restart the stack so the platform-server
> can re-enroll identities.
