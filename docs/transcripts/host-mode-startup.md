# Host-mode startup transcript (2026-02-21)

Environment notes:

- Dependencies run via vanilla Docker (no compose plugins available in this workspace).
- Postgres was started with `docker run -d --name host-agents-db -e POSTGRES_USER=agents -e POSTGRES_PASSWORD=agents -e POSTGRES_DB=agents -p 5443:5432 postgres:16-alpine`.
- OpenZiti controller/edge-router were not available in this sandbox, so the `mock-openziti-loader.mjs` test loader was injected to let the Node services boot and exercise the host-mode flow.

## docker-runner dev

Command:

```bash
timeout 20s env \
  NODE_OPTIONS=--loader=/workspace/platform/packages/docker-runner/__tests__/mocks/mock-openziti-loader.mjs \
  ZITI_IDENTITY_FILE=/workspace/platform/.ziti/identities/dev.agyn-platform.docker-runner.json \
  ZITI_SERVICE_NAME=dev.agyn-platform.platform-api \
  DOCKER_RUNNER_SHARED_SECRET=dev-shared-secret \
  DOCKER_RUNNER_HOST=127.0.0.1 \
  DOCKER_RUNNER_PORT=17071 \
  pnpm --filter @agyn/docker-runner dev
```

Excerpt (`docs/transcripts/runner.log`):

```text
docker-runner listening on http://127.0.0.1:17071
Initializing OpenZiti ingress (identity=/workspace/platform/.ziti/identities/dev.agyn-platform.docker-runner.json, service=dev.agyn-platform.platform-api)
OpenZiti SDK initialized for service dev.agyn-platform.platform-api
Ziti ingress ready for service dev.agyn-platform.platform-api (target=http://127.0.0.1:17071)
```

## platform-server dev

Command:

```bash
timeout 45s env \
  NODE_OPTIONS=--loader=/workspace/platform/packages/docker-runner/__tests__/mocks/mock-openziti-loader.mjs \
  AGENTS_DATABASE_URL=postgresql://agents:agents@127.0.0.1:5443/agents \
  DOCKER_RUNNER_SHARED_SECRET=dev-shared-secret \
  DOCKER_RUNNER_BASE_URL=http://127.0.0.1:17071 \
  LLM_PROVIDER=litellm \
  LITELLM_BASE_URL=http://127.0.0.1:4000 \
  LITELLM_MASTER_KEY=sk-local \
  ZITI_PLATFORM_IDENTITY_FILE=/workspace/platform/.ziti/identities/dev.agyn-platform.platform-server.json \
  ZITI_RUNNER_IDENTITY_FILE=/workspace/platform/.ziti/identities/dev.agyn-platform.docker-runner.json \
  ZITI_IDENTITIES_DIR=/workspace/platform/.ziti/identities \
  ZITI_TMP_DIR=/workspace/platform/.ziti/tmp \
  pnpm --filter @agyn/platform-server dev
```

Excerpt (`docs/transcripts/platform-server.log`):

```text
[Nest] 176648  - 02/21/2026, 2:07:24 AM     LOG [NestFactory] Starting Nest application...
[Nest] 176648  - 02/21/2026, 2:07:24 AM     LOG [GithubService] GithubService: integration disabled (no credentials)
[Nest] 176648  - 02/21/2026, 2:07:24 AM   ERROR [ExceptionHandler] TypeError: fetch failed
...
[cause]: Error: connect ECONNREFUSED 127.0.0.1:1280
```

The platform server now fails fast when the OpenZiti management plane is unreachable, which is expected in this environment without the controller/edge-router stack.
