# OpenZiti integration

The local development stack now provisions an OpenZiti controller, initializer, and edge router. The
`ziti-controller-init` job wraps the OpenZiti CLI inside the official image so you never have to install `ziti` on the
host. It creates/updates the service, policies, and identities, then writes enrollment files to `./.ziti/identities`
(mirrored to `/opt/app/.ziti/identities` inside containers). Platform-server still reconciles controller state at
startup to heal drift, and the docker-runner retains the same service bindings.

The platform-server launches a lightweight HTTP proxy: `pnpm` dev binds to
`127.0.0.1:17071` by default, while the docker-compose overlay overrides it to `0.0.0.0:17071` inside the container so
the port can be published to the host. All docker-runner traffic is tunneled through this proxy instead of the Docker
bridge network.

## Prerequisites

1. Prepare the local `.ziti` directory (creates controller/identity/tmp folders with permissive permissions and SELinux labels when available):

```bash
pnpm ziti:prepare
```

2. Install dependencies and explicitly allow the OpenZiti SDK build step (pnpm blocks install scripts by default):

> **Linux build prerequisites**
>
> The OpenZiti Node SDK falls back to a full native build whenever a prebuilt binary
> is unavailable (for example, when working from the agyn fork). Make sure the host
> has the standard build toolchain plus `autoconf`, `automake`, `libtool`, `m4`, and
> `perl` alongside the existing `build-essential`, `cmake`, `ninja-build`,
> `python3`, `pkg-config`, `git`, `curl`, `zip`, and `unzip` packages. The CI
> containers install the same list so the docker-runner/platform-server bring-up can
> compile the SDK reliably.

```bash
pnpm approve-builds
# Select @openziti/ziti-sdk-nodejs and confirm
```

> If interactive approvals are not available you can run the install script once manually:
>
> ```bash
> pnpm --dir node_modules/.pnpm/@openziti+ziti-sdk-nodejs@0.27.0/node_modules/@openziti/ziti-sdk-nodejs run install
> ```

3. Ensure the OpenZiti controller stack is running and the router finishes enrolling:

```bash
docker compose up -d ziti-controller ziti-edge-router
```

> Platform-server and docker-runner now run on the host via `pnpm dev`. Docker Compose remains only for shared
> dependencies (controller, databases, LiteLLM, Vault, etc.).

Watch `docker compose logs -f ziti-edge-router` until you see the router enroll ("successfully connected to controller")
before attempting the init job. If the router refuses to start, wipe `.ziti/controller` using the reset steps below and
retry.

4. Bootstrap the controller via the init job (idempotent; re-run whenever identity JSON needs to be regenerated). Running the job with your host UID/GID keeps the generated identity files readable without extra chmod steps:

```bash
docker compose run --rm --user "$(id -u):$(id -g)" ziti-controller-init
```

The job now waits up to five minutes for the router named by `ZITI_ROUTER_NAME` (default `dev-edge-router`). If the
router is still missing after the timeout it logs a warning, skips router role updates, and exits so you can rerun it
later. Set `ZITI_SKIP_ROUTER_WAIT=true` to disable the wait entirely.

5. Copy `.env` files and ensure the OpenZiti variables point to the same `.ziti` tree. Use the template that matches
   how you run the services:

### Host (`pnpm dev`)

- `packages/platform-server/.env`

```
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
ZITI_IDENTITY_FILE=/absolute/path/to/platform/.ziti/identities/dev.agyn-platform.docker-runner.json
ZITI_SERVICE_NAME=dev.agyn-platform.platform-api
```

> Replace `/absolute/path/to/platform` with your local repository root (for example `/Users/casey/dev/platform`).

## CI-aligned smoke test

- Run `pnpm --filter @agyn/platform-server run test:ziti` after the prerequisites above to boot the same lean stack used
  by CI (`e2e/ziti/docker-compose.ci.yml`).
- The helper script wipes `.ziti`, brings the controller/router/runner online, ensures the DinD engine exposes the
  `agents_net` network, and drives a real workspace create → delete cycle via HTTP.
- No container builds occur; the Node containers mount the local checkout and reuse the existing `node_modules` tree so
  the loop completes in under five minutes.
- Logs for `ziti-controller`, `ziti-edge-router`, `docker-runner`, and `platform-server` are dumped automatically on
  failure to speed up triage.
- The flow enables the private `/test/workspaces` controller via `ENABLE_TEST_WORKSPACE_API=1`, matching the CI job.

## Host-mode workflow

After completing the prerequisites and enabling the `.env` entries above, the developer stack can be verified on the host with the following sequence (clean-room friendly):

1. Bring up the persistence dependencies:

```bash
docker compose up -d postgres agents-db litellm-db litellm
```

2. Start the docker-runner in a terminal. Wait for both the Fastify log and the Ziti ingress message:

```bash
pnpm --filter @agyn/docker-runner dev
# ...
# {"level":30,..."msg":"Server listening at http://127.0.0.1:7071"}
# Ziti ingress ready for service dev.agyn-platform.platform-api
```

3. Start the platform-server in a separate terminal (ensure `DOCKER_RUNNER_BASE_URL=http://127.0.0.1:17071` via `.env` or env var):

```bash
DOCKER_RUNNER_BASE_URL=http://127.0.0.1:17071 pnpm --filter @agyn/platform-server dev
```

The `DockerRunnerConnectivityProbe` now waits for the local Ziti proxy before giving up. It retries 30 times with a 2s interval by default (~60s). Override the timing via `DOCKER_RUNNER_PROBE_MAX_ATTEMPTS` and `DOCKER_RUNNER_PROBE_INTERVAL_MS` if you need longer windows for slower machines.

4. Validate the tunnel:

```bash
curl http://127.0.0.1:17071/v1/ready
```

Expected response:

```json
{"status":"ready"}
```

## Runtime flow

1. `docker compose run --rm ziti-controller-init` wraps the OpenZiti CLI to create/update the service,
   policies, router bindings, and the two device identities, then writes the enrolled JSON files to `.ziti/identities/`.
   The same directory is mounted into `/opt/app/.ziti/identities` when running inside Docker.
2. Platform-server still authenticates to the management API at startup to reconcile drift (service attributes,
   policies, router roles) before launching the local proxy. If the identity files already exist they are reused as-is.
3. Ziti runner proxy starts on `127.0.0.1:17071` by default when running via `pnpm dev`. The docker-compose overlay
   overrides it to `0.0.0.0:17071` inside the container so the port can be published. All requests to docker-runner are
   routed through this proxy.
4. Docker-runner continues to listen on the configured TCP port (default `7071`) and now exposes the same API via an
   OpenZiti Express listener that proxies traffic to the local Fastify server.

## Smoke test

After both services start:

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

## Resetting OpenZiti state

The controller stores PKI and router enrollment artifacts in `./.ziti/controller`. Stale files can cause hostname or TLS
conflicts, so a clean bootstrap consists of:

```bash
docker compose down -v ziti-controller ziti-edge-router
rm -rf ./.ziti/controller ./.ziti/identities ./.ziti/tmp
docker compose up -d ziti-controller ziti-edge-router
docker compose run --rm ziti-controller-init
```

Re-run the init job whenever it warns that the router has not registered so role attributes stay in sync.
