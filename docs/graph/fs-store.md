# Filesystem-backed Graph Store (format: 2)

Overview
- Graph persistence writes directly to the filesystem under `GRAPH_REPO_PATH` (default `./data/graph`).
- The layout matches the legacy git working tree: `graph.meta.yaml`, `nodes/`, `edges/`, and `variables.yaml` live at the path root.
- No journal or snapshot directories are created; atomic temp-write + rename updates the working files in place.
- `GRAPH_BRANCH` is retained as metadata for observability but does not influence the filesystem layout.
- `.git` directories are ignored; the repository no longer shells out to git or runs migrations.

Working tree layout (format: 2)
- `graph.meta.yaml`: `{ name, version, updatedAt, format: 2 }`
- `variables.yaml`: optional list of `{ key, value }`
- `nodes/`: one YAML file per node (`nodes/<urlencoded nodeId>.yaml`)
- `edges/`: one YAML file per edge (`edges/<urlencoded edgeId>.yaml`)
- `.graph.lock`: repository-scoped advisory lock used during writes

Deterministic edge IDs
- Edge id format remains `${source}-${sourceHandle}__${target}-${targetHandle}`.
- When a request supplies an `edge.id`, the server ensures it matches the deterministic form. Mismatches return HTTP 400 with a descriptive `{ error: 'Edge id mismatch: expected <id> got <id>' }` body.

Apply lifecycle
1. Validate the upsert payload against the template registry (unknown config keys are stripped prior to persistence).
2. Acquire a filesystem lock by creating `.graph.lock`. If the lock cannot be obtained within `GRAPH_LOCK_TIMEOUT_MS` (default 5s), the server returns `LOCK_TIMEOUT`.
3. Load the current graph from the working tree.
4. Compute diffs between the stored graph and the request. Write changed nodes, edges, variables, and `graph.meta.yaml` via temp files + rename + directory fsync.
5. On any failure, restore the working tree from the last known good graph before surfacing `PERSIST_FAILED`.

Error behaviors
- `VERSION_CONFLICT (409)`: supplied version is stale; response includes `{ error, current }`.
- `LOCK_TIMEOUT (409)`: lock acquisition exceeded configured timeout.
- `Edge id mismatch (400)`: deterministic id check failed.
- `PERSIST_FAILED (500)`: filesystem writes failed; request rolled back.

Optimistic locking
- `version` increments monotonically. Clients must send the latest version on every POST `/api/graph`. Stale versions receive `409 { error: 'VERSION_CONFLICT', current }`.

Notes
- YAML remains the only supported on-disk format. Convert any legacy JSON files before pointing the server at the directory.
- Filename decoding is preserved: if a node/edge YAML omits an explicit `id`, the server derives it from the file name.
