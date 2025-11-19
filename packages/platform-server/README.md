# Server

Runtime for graph-driven agents, tool adapters, triggers, and memory. See docs for architecture.

Graph persistence
- Configure via env:
  - GRAPH_REPO_PATH: path to the local git repo for graph state (default `./data/graph`)
  - GRAPH_BRANCH: branch name to use (default `graph-state`)
  - GRAPH_AUTHOR_NAME / GRAPH_AUTHOR_EMAIL: default git author (can be overridden per request with headers `x-graph-author-name`/`x-graph-author-email`)
- On startup, the server initializes `GRAPH_REPO_PATH` as a git repo if missing, ensures branch checkout, seeds root-level per-entity layout (format: 2) with empty `nodes/` and `edges/`, writes `graph.meta.json` for the active graph name (default `main`), and commits the initial state.
 - The existing API `/api/graph` supports GET and POST. POST maintains optimistic locking via the `version` field. Each successful write creates one commit with message `chore(graph): <name> v<version> (+/- nodes, +/- edges)` on the configured branch.
 - Error responses:
   - 409 VERSION_CONFLICT with `{ error, current }` body when version mismatch.
   - 409 LOCK_TIMEOUT when advisory lock not acquired within timeout.
   - 500 COMMIT_FAILED when git commit fails; persistence is rolled back to last committed state.

Storage layout (format: 2)
- Preferred working tree layout is root-level per-entity: `graph.meta.json`, `nodes/`, `edges/`.
- Filenames are `encodeURIComponent(id)`; edge id is deterministic: `<src>-<srcH>__<tgt>-<tgtH>`.
- The service can read from historical layouts in HEAD for compatibility: per-graph per-entity under `graphs/<name>/` or legacy monolith `graphs/<name>/graph.json`.
- Robustness: when reading, if an entity file lacks an explicit `id` field, the service decodes it from the filename (see readEntitiesFromDir/readFromHeadRoot).

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
- Prisma schema lives under prisma/schema.prisma. Scripts:
  - pnpm --filter @agyn/platform-server prisma:generate
  - pnpm --filter @agyn/platform-server prisma:migrate
  - pnpm --filter @agyn/platform-server prisma:studio
- Best-effort: if AGENTS_DATABASE_URL is not set or DB errors occur, reducers fall back to in-memory only.
- Local dev:
  - LLM_PROVIDER must be set explicitly to 'openai' or 'litellm'. There is no default.
  - GitHub integration is optional. If no GitHub env is provided, the server boots and logs that GitHub is disabled. Any GitHub-dependent feature will error at runtime until credentials are configured.

## Prisma workflow (platform-server)

1) Prerequisites
- Postgres running locally or reachable from your dev/CI environment.
- Set AGENTS_DATABASE_URL to a Postgres connection string.
  - Example (docker compose agents-db service on 5443): `postgresql://agents:agents@localhost:5443/agents`
- Node.js and pnpm installed (repo uses pnpm workspaces).

2) Generate Prisma Client after schema changes
- The Prisma schema is at `packages/platform-server/prisma/schema.prisma`.
- After any schema change, generate the client for the platform-server package:
  - `pnpm -C packages/platform-server prisma:generate`
  - Alternative filter syntax: `pnpm --filter @agyn/platform-server prisma:generate`
- Tip: Always target the package (do not run `prisma generate` from the repo root).

3) Create migrations with Prisma Migrate (no handwritten SQL)
- Edit `schema.prisma`; do not write SQL directly.
- Create the initial migration (convenience script):
  - `pnpm -C packages/platform-server prisma:migrate`  # runs `prisma migrate dev --name init`
- Create a named migration for subsequent changes:
  - `pnpm -C packages/platform-server prisma migrate dev --name add_message_table`

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
- Client not found / types missing: run `prisma:generate` for the platform-server package.
- Monorepo targeting: use `pnpm -C packages/platform-server ...` or `pnpm --filter @agyn/platform-server ...`.
- Import enums/types from `@prisma/client` in server code; do not re-declare.
- Ensure `AGENTS_DATABASE_URL` is set in env (see `packages/platform-server/.env.example`).
- Local Postgres: `docker compose up -d agents-db` starts a DB on port 5443 with user/password `agents`.

7) CI note
- CI runs Prisma client generation before tests/build:
  - `pnpm --filter @agyn/platform-server prisma:generate`
- For production deployments, apply migrations with `prisma migrate deploy` as part of your release process.

Messaging (Slack-only v1)

- `send_message` routes replies to Slack using `Thread.channel` (descriptor written by `SlackTrigger`).
- SlackTrigger requires bot_token in node config; token is resolved during provision; no global Slack config or tokens.
- No other adapters are supported in v1; attachments/ephemeral not supported.
