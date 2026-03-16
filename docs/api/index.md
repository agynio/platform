# API Reference

This reference summarizes selected HTTP endpoints and socket events exposed by the server. All responses are JSON. Errors use a structured envelope as noted per route.

Conventions
- Base path: `/api` for primary routes. Some UI-scoped routes live under `/graph`.
- Error envelope: `{ error: string, ...details }` or `{ code, message, details? }` depending on the route. The shapes below reflect current server behavior.

Templates
- GET `/api/templates`
  - 200: Template registry schema with templates, capabilities, and config JSON Schemas.
  - Example:
    ```bash
    curl http://localhost:3010/api/templates
    ```

Templates alias
- GET `/graph/templates` → same as `/api/templates`

Node status and actions
- GET `/graph/nodes/:nodeId/status`
  - 200: `{ provisionStatus? }`
- POST `/graph/nodes/:nodeId/actions`
  - Body: `{ action: 'provision'|'deprovision' }`
  - 204: no body on success; server also emits a `node_status` socket event
  - 400 `{ error: 'unknown_action' }`
  - 500 `{ error: string }`
 - POST `/graph/nodes/:nodeId/discover-tools`
  - 200 `{ tools: Array<{ name: string; description?: string }>, updatedAt?: string }`
  - 400 `{ error: 'node_not_mcp' }`
  - 404 `{ error: 'node_not_found' }`

Agent runs timeline
- GET `/api/agents/runs/:runId/events`
  - Query params (optional unless noted):
    - `types` and/or repeated `type` to filter by event kind (comma-separated values supported)
    - `statuses` and/or repeated `status` for status filtering
    - `limit` (1-1000, default server-side)
    - `order` (`asc`|`desc`, default `asc`)
    - Cursor pagination: `cursor[ts]`, `cursor[id]`
  - 200 `{ items: RunTimelineEvent[], nextCursor: { ts, id } | null }`
  - Notes:
    - Each LLM call item includes `contextItems`, an ordered list of both input (`direction: 'input'`) and output (`'output'`) rows. Each row surfaces `{ id, contextItemId, direction, isNew, index, createdAt }`.
    - Fetch full context payloads via the Context items batch endpoint using the `contextItemId` values returned above.

Context items
- GET `/api/agents/context-items?ids=<uuid>&ids=<uuid>`
  - Query: one or more `ids` params (comma-separated lists supported); invalid UUIDs are rejected with 400.
  - 200 `{ items: Array<{ id, role, contentText, contentJson, metadata, sizeBytes, createdAt }> }`
  - Empty `ids` returns `{ items: [] }`.

Vault proxy (enabled only when VAULT_ENABLED=true)
- GET `/api/vault/mounts` → `{ items: string[] }`
- GET `/api/vault/kv/:mount/paths?prefix=` → `{ items: string[] }`
- GET `/api/vault/kv/:mount/keys?path=` → `{ items: string[] }`
- POST `/api/vault/kv/:mount/write`
  - Body: `{ path: string, key: string, value: string }`
  - 201 `{ mount, path, key, version }`
  - 400 `{ error: 'invalid_body' }`
  - 4xx/5xx `{ error: 'vault_write_failed' }`

Sockets
- Default namespace (no custom path)
  - Event `node_status`: `{ nodeId, provisionStatus?, updatedAt? }`
  - See docs/graph/status-updates.md and docs/ui/graph/index.md

Notes
- Route handlers surface structured errors and emit socket events on state changes.
- Graph snapshots are sourced from the Teams service; the platform no longer exposes `/api/graph`.
- MCP mutation guard prevents unsafe changes to MCP commands.
- Error codes align with the error envelope described above.
Nix proxy
- GET `/api/nix/packages?query=`
  - 200 `{ packages: Array<{ name: string, description?: string|null }> }`
  - 400 `{ error: 'validation_error', details }`
  - 5xx `{ error: 'upstream_error'|'server_error' }`
- GET `/api/nix/versions?name=`
  - 200 `{ versions: string[] }`
  - 404 `{ error: 'not_found' }`
  - 400 `{ error: 'validation_error' }`
  - 504 `{ error: 'timeout' }`
- GET `/api/nix/resolve?name=&version=`
  - 200 `{ name: string, version: string, attributePath: string, commitHash: string }`
  - 404 `{ error: 'not_found' }`
  - 400 `{ error: 'validation_error' }`
  - 504 `{ error: 'timeout' }`
