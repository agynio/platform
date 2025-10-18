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

Graph state (Mongo or Git-backed)
- GET `/api/graph`
  - 200: Persisted graph document: `{ name, version, updatedAt, nodes, edges }`
  - Example:
    ```bash
    curl http://localhost:3010/api/graph
    ```
- POST `/api/graph`
  - Body: `PersistedGraphUpsertRequest` → `{ name='main', version, nodes, edges }`
  - Headers (optional): `x-graph-author-name`, `x-graph-author-email` for Git-backed store commits.
  - Success: returns updated persisted graph `{ name, version, updatedAt, nodes, edges }`
  - Errors (status → body):
    - 409 `{ error: 'VERSION_CONFLICT', current?: PersistedGraph }`
    - 409 `{ error: 'LOCK_TIMEOUT' }`
    - 409 `{ error: 'MCP_COMMAND_MUTATION_FORBIDDEN' }` (enum value GraphErrorCode.McpCommandMutationForbidden)
    - 500 `{ error: 'COMMIT_FAILED' }`
    - 400 `{ error: 'Bad Request' | string }` (includes Git-store deterministic edge check; see notes)
  - Notes:
    - When `GRAPH_STORE=git`:
      - A provided `edge.id` must match the deterministic id `${source}-${sourceHandle}__${target}-${targetHandle}`. If it doesn't, the server returns `400` with `{ error: 'Edge id mismatch: expected <id> got <id>' }`.
      - Commit failures surface as `500 { error: 'COMMIT_FAILED' }`.
      - Lock acquisition timeout surfaces as `409 { error: 'LOCK_TIMEOUT' }`.
    - When `GRAPH_STORE=mongo`, the deterministic edge check is not enforced by the store and Git-specific errors do not occur.
  - Example:
    ```bash
    curl -X POST http://localhost:3010/api/graph \
      -H 'content-type: application/json' \
      -H 'x-graph-author-name: Jane Dev' \
      -H 'x-graph-author-email: jane@example.com' \
      -d '{"name":"main","version":1,"nodes":[],"edges":[]}'
    ```

Templates alias
- GET `/graph/templates` → same as `/api/templates`

Node status and actions
- GET `/graph/nodes/:nodeId/status`
  - 200: `{ isPaused?, provisionStatus?, dynamicConfigReady? }`
- POST `/graph/nodes/:nodeId/actions`
  - Body: `{ action: 'pause'|'resume'|'provision'|'deprovision' }`
  - 204: no body on success; server also emits a `node_status` socket event
  - 400 `{ error: 'unknown_action' }`
  - 500 `{ error: string }`

Dynamic-config schema (read-only)
- GET `/graph/nodes/:nodeId/dynamic-config/schema`
  - 200: `{ ready: boolean, schema?: JSONSchema }`
  - 404: `{ error: 'node_not_found' }`
  - 500: `{ error: 'dynamic_config_schema_error' | string }`

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
  - Event `node_status`: `{ nodeId, isPaused?, provisionStatus?, dynamicConfigReady?, updatedAt }`
  - Event `node_config`: `{ nodeId, config, dynamicConfig, version }` (emitted after successful /api/graph save with changes)
  - See docs/graph/status-updates.md and docs/ui/graph/index.md

Notes
- Route handlers surface structured errors and emit socket events on state changes.
- The Git-backed store enforces deterministic edge IDs and advisory locking.
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
- GET `/api/nix/package-info?name=`
  - 200 `{ name: string, releases: Array<{ version: string, attribute_path?: string, commit_hash?: string, platforms?: string[] }> }`
  - 404 `{ error: 'not_found' }`
  - 400 `{ error: 'validation_error' }`
  - 504 `{ error: 'timeout' }`
