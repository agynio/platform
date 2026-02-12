# Server

Runtime for graph-driven agents, tool adapters, triggers, and memory. See docs for architecture.

Graph persistence
- Configure via env:
  - `GRAPH_REPO_PATH`: filesystem root for the working tree (default `./data/graph`).
  - `GRAPH_BRANCH`: logical branch label retained for compatibility/telemetry (default `main`).
  - `GRAPH_AUTHOR_NAME` / `GRAPH_AUTHOR_EMAIL`: optional metadata forwarded to audit logs.
  - `GRAPH_LOCK_TIMEOUT_MS`: file-lock acquisition timeout (default `5000`).
- On startup the server ensures `GRAPH_REPO_PATH` exists with `nodes/`, `edges/`, `variables.yaml`, and `graph.meta.yaml`. There is no dataset indirection or Git requirement; `.git` directories are ignored if present.
- `/api/graph` semantics remain the same (GET to read, POST to upsert). Writes continue to use optimistic locking via the `version` field and acquire `.graph.lock` inside `GRAPH_REPO_PATH` before writing. Each write builds a staged working tree in a sibling directory, fsyncs it, and atomically swaps it into place so readers only see committed graphs; old trees move to `.graph-backup-*` temporarily and are deleted immediately.
- Error responses:
   - `409 VERSION_CONFLICT` with `{ error, current }` when the supplied version is stale.
   - `409 LOCK_TIMEOUT` if the repository lock cannot be acquired within the configured timeout.
   - `500 PERSIST_FAILED` when filesystem writes fail unexpectedly; the in-flight changes are rolled back to the last committed state.

## Networking and cache

- Workspace containers automatically join the Docker network specified by `WORKSPACE_NETWORK_NAME` (default `agents_net`) with an alias derived from the thread id. Ensure this network exists on the host so in-cluster services such as `ncps` resolve.
- DinD sidecars keep `networkMode=container:<workspaceId>` so the workspace and sidecar share namespaces regardless of the workspace network.
- Set `NCPS_URL_SERVER` (host-reachable) and `NCPS_URL_CONTAINER` (in-network, e.g., `http://ncps:8501`) together so Nix substituters resolve correctly inside workspaces.
- When the server injects `NIX_CONFIG`, workspace startup logs the resolved substituters/trusted keys and runs `getent hosts ncps` plus `curl http://ncps:8501/nix-cache-info`, emitting warnings if connectivity fails.
-
- Workspace volume GC runs in the background (enabled by default). Tune with:
  - `VOLUME_GC_ENABLED` (default `true`)
  - `VOLUME_GC_INTERVAL_MS` (default `60000`)
  - `VOLUME_GC_MAX_PER_SWEEP` (default `100`)
  - `VOLUME_GC_CONCURRENCY` (default `3`)
  - `VOLUME_GC_COOLDOWN_MS` (default `600000`)
-
## MCP environment configuration

Local MCP server nodes accept an environment overlay via the `env` array in node config. Each entry includes a `name` and a `value`, where `value` may be a literal string or a reference resolved at runtime.

Examples:

- Static string

  ```json
  {
    "name": "API_BASE_URL",
    "value": "https://api.example.com"
  }
  ```

- Vault-backed secret

  ```json
  {
    "name": "API_KEY",
    "value": {
      "kind": "vault",
      "path": "secret/data/mcp",
      "key": "API_KEY"
    }
  }
  ```

- Graph variable

  ```json
  {
    "name": "ORG_ID",
    "value": {
      "kind": "var",
      "name": "ORG_ID"
    }
  }
  ```

At runtime the node calls `EnvService.resolveProviderEnv`, which delegates to `ReferenceResolverService` in strict mode. Resolution rules:

- Values must resolve to strings; references are coerced using vault and graph variable providers.
- Duplicate names are rejected with `env_name_duplicate` before any lookup occurs.
- Missing resolver dependencies raise `env_reference_resolver_missing`.
- Unresolved references throw `env_reference_unresolved` and include the JSON Pointer path (e.g. `/env/API_KEY/value`) in the error details.

The resolved overlay is merged with any base environment and forwarded to Docker exec sessions for both discovery and tool calls, ensuring MCP servers receive the same env regardless of execution path.

Storage layout (format: 2)
- Repository root: `<GRAPH_REPO_PATH>` contains `graph.meta.yaml`, `variables.yaml`, `nodes/`, and `edges/`.
- Filenames remain `encodeURIComponent(id)`; edge ids are deterministic `<src>-<srcHandle>__<tgt>-<tgtHandle>`.
- Writes stage a complete working tree in a sibling `.graph-staging-*` directory, atomically swap it into `<GRAPH_REPO_PATH>`, and delete the previous tree (which briefly lives at `.graph-backup-*`). No persistent recovery directories are created, and `.git` directories are moved back into place after each swap if present.

Enabling Memory
- Default connector config: placement=after_system, content=tree, maxChars=4000.
- To wire memory into an agent's CallModel at runtime, add a `memoryNode` and connect its `$self` source port to the agent's `callModel`/`setMemoryConnector` target port (or use template API to create a connector).
- Tool usage: attach the unified `memory` tool to the `simpleAgent` via the `memory` target port on the tool; commands: `read|list|append|update|delete`.
- Scope: `global` per node by default; use `perThread` to isolate by thread id.
- Backing store uses Postgres via Prisma; no MongoDB dependency.

Examples
- Set connector defaults programmatically: `mem.createConnector({ placement: 'after_system', content: 'tree', maxChars: 4000 })`.
- The CallModel injects a SystemMessage either after the system prompt or as the last message depending on placement.
Persistent conversation state (Prisma)
- Optional Postgres-backed persistence for LLM conversation state per thread/node.
- Set AGENTS_DATABASE_URL to a Postgres connection string. docker-compose provides a local agents-db on 5443:
  - Example: postgresql://agents:agents@localhost:5443/agents
- Prisma schema lives under prisma/schema.prisma. Common commands:
  - `pnpm --filter @agyn/platform-server prisma migrate deploy`
  - `pnpm --filter @agyn/platform-server prisma generate`
  - `pnpm --filter @agyn/platform-server prisma studio`
- Best-effort: if AGENTS_DATABASE_URL is not set or DB errors occur, reducers fall back to in-memory only.
- Local dev:
  - LLM_PROVIDER must be set explicitly to 'openai' or 'litellm'. There is no default.
  - When `LLM_PROVIDER=litellm`, the server expects `LITELLM_BASE_URL` and `LITELLM_MASTER_KEY`.
    - In docker-compose development the admin base defaults to `http://127.0.0.1:4000` if unset.
    - For all other environments, set an explicit `LITELLM_BASE_URL` and master key.

## LiteLLM admin setup

For local administration of LiteLLM credentials and models, configure the following environment variables on the platform server:

```env
LITELLM_BASE_URL=http://127.0.0.1:4000
LITELLM_MASTER_KEY=sk-dev-master-1234
```

Replace `sk-dev-master-1234` with your actual LiteLLM master key if it differs.

## Context item payload guard

LiteLLM call logging, summarization, and tool execution persist context items as JSON blobs inside Postgres. The persistence layer now strips all `\u0000` (null bytes) from `contentText`, `contentJson`, and `metadata` prior to writes so Prisma does not reject the payload.

- Sanitization runs automatically for every `contextItem.create`/`update`.
- Enable a hard guard during development by setting `CONTEXT_ITEM_NULL_GUARD=1`. When the guard is active the server throws `ContextItemNullByteGuardError` if any unsanitized payload reaches the repository, ensuring new call sites cannot bypass the sanitizer.

Set the flag while running targeted tests or during local debugging to immediately catch regressions that would otherwise surface as Prisma `null byte in string` errors at runtime.
  - GitHub integration is optional. If no GitHub env is provided, the server boots and logs that GitHub is disabled. Any GitHub-dependent feature will error at runtime until credentials are configured.
- Shell tool streaming persistence:
  - Tool stdout/stderr chunks are stored via Prisma when the `tool_output_*` tables exist.
  - After pulling migrations, run both commands to ensure the schema is installed locally:
    - `pnpm --filter @agyn/platform-server prisma migrate deploy`
    - `pnpm --filter @agyn/platform-server prisma generate`
  - If the tables are missing, the server logs a warning, continues streaming over websockets, and the snapshot endpoint returns HTTP 501 instructing you to run the commands above.

## Prisma workflow (platform-server)

1) Prerequisites
- Postgres running locally or reachable from your dev/CI environment.
- Set AGENTS_DATABASE_URL to a Postgres connection string.
  - Example (docker compose agents-db service on 5443): `postgresql://agents:agents@localhost:5443/agents`
- Node.js and pnpm installed (repo uses pnpm workspaces).

2) Generate Prisma Client after schema changes
- The Prisma schema is at `packages/platform-server/prisma/schema.prisma`.
- After any schema change, generate the client for the platform-server package:
  - `pnpm --filter @agyn/platform-server prisma generate`
  - Alternative (inside package): `pnpm -C packages/platform-server prisma generate`
- Tip: Always target the package (do not run `prisma generate` from the repo root).

3) Create migrations with Prisma Migrate (no handwritten SQL)
- Edit `schema.prisma`; do not write SQL directly.
- Create the initial migration:
  - `pnpm --filter @agyn/platform-server prisma migrate dev --name init`
- Create a named migration for subsequent changes:
  - `pnpm --filter @agyn/platform-server prisma migrate dev --name add_message_table`

4) Apply migrations (dev vs deploy)
- Development/local: applies and generates client if needed
  - `pnpm -C packages/platform-server prisma migrate dev`
- CI/production: apply pending migrations only
  - `pnpm -C packages/platform-server prisma migrate deploy`

5) Prisma Studio and reset
- Studio (inspect/edit data):
  - `pnpm -C packages/platform-server prisma:studio`
- Reset dev database (drops data, re-applies migrations):
  - `pnpm -C packages/platform-server prisma migrate reset`  # interactive
  - Add `--force` to skip prompts if needed.

6) Common pitfalls and guidance
- Client not found / types missing: run `pnpm --filter @agyn/platform-server prisma generate` for the platform-server package.
- Monorepo targeting: use `pnpm -C packages/platform-server ...` or `pnpm --filter @agyn/platform-server ...`.
- Import enums/types from `@prisma/client` in server code; do not re-declare.
- Ensure `AGENTS_DATABASE_URL` is set in env (see `packages/platform-server/.env.example`).
- Local Postgres: `docker compose up -d agents-db` starts a DB on port 5443 with user/password `agents`.

7) CI note
- CI runs Prisma client generation before tests/build:
  - `pnpm --filter @agyn/platform-server prisma generate`
- For production deployments, apply migrations with `prisma migrate deploy` as part of your release process.

Messaging (Slack-only v1)

- `send_message` routes replies to Slack using `Thread.channel` (descriptor written by `SlackTrigger`) when a channel node is registered, and falls back to persisting the reply when no channel node exists (e.g., web-created threads).
- Runs triggered via `send_message` emit only `tool_execution` run events; no additional `invocation_message` entry is created for the persisted transport message.
- SlackTrigger requires bot_token in node config; token is resolved during provision; no global Slack config or tokens.
- No other adapters are supported in v1; attachments/ephemeral not supported.
