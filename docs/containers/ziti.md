# OpenZiti integration

The local development stack now provisions an OpenZiti controller, initializer, and edge router. The
`ziti-controller-init` job wraps the OpenZiti CLI inside the official image so you never have to install `ziti` on the
host. It creates/updates the service, policies, and identities, then writes enrollment files to `./.ziti/identities`
(mirrored to `/opt/app/.ziti/identities` inside containers). Platform-server still reconciles controller state at
startup to heal drift, and the docker-runner retains the same service bindings.

When OpenZiti is enabled the platform-server launches a lightweight HTTP proxy: `pnpm` dev binds to
`127.0.0.1:17071` by default, while the docker-compose overlay overrides it to `0.0.0.0:17071` inside the container so
the port can be published to the host. All docker-runner traffic is tunneled through this proxy instead of the Docker
bridge network.

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

2. Ensure the OpenZiti controller stack is running:

```bash
docker compose up -d ziti-controller ziti-edge-router
```

> Running platform-server and docker-runner inside Docker? After the infra stack is up,
> start them with `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d platform-server docker-runner`
> so they share the same controller and network.

3. Bootstrap the controller via the init job (idempotent; re-run whenever identity JSON needs to be regenerated):

```bash
docker compose run --rm ziti-controller-init
```

4. Copy `.env` files and enable OpenZiti flags. Use the template that matches how you run the services:

### Host (`pnpm dev`)

- `packages/platform-server/.env`

```
ZITI_ENABLED=true
ZITI_MANAGEMENT_URL=https://ziti-controller:1280/edge/management/v1
ZITI_USERNAME=admin
ZITI_PASSWORD=admin
ZITI_INSECURE_TLS=true
ZITI_SERVICE_NAME=dev.agyn-platform.platform-api
ZITI_ROUTER_NAME=dev-edge-router
ZITI_RUNNER_PROXY_HOST=127.0.0.1
ZITI_RUNNER_PROXY_PORT=17071
ZITI_PLATFORM_IDENTITY_FILE=/absolute/path/to/platform/.ziti/identities/dev.agyn-platform.platform-server.json
ZITI_RUNNER_IDENTITY_FILE=/absolute/path/to/platform/.ziti/identities/dev.agyn-platform.docker-runner.json
ZITI_IDENTITIES_DIR=/absolute/path/to/platform/.ziti/identities
ZITI_TMP_DIR=/absolute/path/to/platform/.ziti/tmp
```

- `packages/docker-runner/.env`

```
ZITI_ENABLED=true
ZITI_IDENTITY_FILE=/absolute/path/to/platform/.ziti/identities/dev.agyn-platform.docker-runner.json
ZITI_SERVICE_NAME=dev.agyn-platform.platform-api
```

> Replace `/absolute/path/to/platform` with your local repository root (for example `/Users/casey/dev/platform`).

### Docker compose overlay (`docker-compose.dev.yml`)

Compose already mounts `./.ziti` into `/opt/app/.ziti` inside each container. Override the same variables with
container paths (via `.env` or `docker-compose.dev.yml`):

```
ZITI_ENABLED=true
ZITI_MANAGEMENT_URL=https://ziti-controller:1280/edge/management/v1
ZITI_USERNAME=admin
ZITI_PASSWORD=admin
ZITI_INSECURE_TLS=true
ZITI_SERVICE_NAME=dev.agyn-platform.platform-api
ZITI_ROUTER_NAME=dev-edge-router
ZITI_RUNNER_PROXY_HOST=0.0.0.0
ZITI_RUNNER_PROXY_PORT=17071
ZITI_PLATFORM_IDENTITY_FILE=/opt/app/.ziti/identities/dev.agyn-platform.platform-server.json
ZITI_RUNNER_IDENTITY_FILE=/opt/app/.ziti/identities/dev.agyn-platform.docker-runner.json
ZITI_IDENTITIES_DIR=/opt/app/.ziti/identities
ZITI_TMP_DIR=/opt/app/.ziti/tmp

# docker-runner container
ZITI_IDENTITY_FILE=/opt/app/.ziti/identities/dev.agyn-platform.docker-runner.json
```

## Runtime flow

1. `docker compose run --rm ziti-controller-init` wraps the OpenZiti CLI to create/update the service,
   policies, router bindings, and the two device identities, then writes the enrolled JSON files to `.ziti/identities/`.
   The same directory is mounted into `/opt/app/.ziti/identities` when running inside Docker.
2. Platform-server still authenticates to the management API at startup to reconcile drift (service attributes,
   policies, router roles) before launching the local proxy. If the identity files already exist they are reused as-is.
3. Ziti runner proxy starts on `127.0.0.1:17071` by default when running via `pnpm dev`. The docker-compose overlay
   overrides it to `0.0.0.0:17071` inside the container so the port can be published. All requests to docker-runner are
   routed through this proxy when `ZITI_ENABLED=true`.
4. Docker-runner continues to listen on the configured TCP port (default `7071`) and now exposes the same API via an
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

> To reset the environment delete `./.ziti/identities` and `./.ziti/tmp` (or the `/opt/app/.ziti/*` mounts inside Docker), then restart the stack so the platform-server
> can re-enroll identities.
