# Filesystem-backed Graph Store (format: 2)

Overview
- Graph persistence now writes directly to the filesystem under `GRAPH_DATA_PATH` without relying on Git commits.
- Each dataset lives under `<GRAPH_DATA_PATH>/datasets/<GRAPH_DATASET>` and contains the full working tree plus recovery artifacts.
- The file `active-dataset.txt` at the root of `GRAPH_DATA_PATH` records the active dataset name. When `GRAPH_DATASET` is not explicitly set, the server reads this pointer to decide which dataset to load.

Dataset layout (format: 2)
- `graph.meta.yaml`: `{ name, version, updatedAt, format: 2 }`
- `variables.yaml`: optional list of `{ key, value }`
- `nodes/`: one YAML file per node (`nodes/<urlencoded nodeId>.yaml`)
- `edges/`: one YAML file per edge (`edges/<urlencoded edgeId>.yaml`)
- `journal.ndjson`: append-only JSON lines `{ version, timestamp, graph }` for recovery if working tree + snapshot fail
- `snapshots/<version>/`: latest snapshot of the dataset (same layout as working tree)
- `.graph.lock`: dataset-scoped advisory lock used during writes

Deterministic edge IDs
- Edge id format remains `${source}-${sourceHandle}__${target}-${targetHandle}`.
- When a request supplies an `edge.id`, the server ensures it matches the deterministic form. Mismatches return HTTP 400 with a descriptive `{ error: 'Edge id mismatch: expected <id> got <id>' }` body.

Apply lifecycle
1. Validate the upsert payload against the template registry (unknown config keys are stripped prior to persistence).
2. Acquire a filesystem lock by creating `.graph.lock`. If the lock cannot be obtained within `GRAPH_LOCK_TIMEOUT_MS` (default 5s), the server returns `LOCK_TIMEOUT`.
3. Load the current graph from the working tree. If the working tree is corrupt, fall back to the latest snapshot, then journal.
4. Compute diffs between the stored graph and the request. Write changed nodes, edges, variables, and `graph.meta.yaml` via temp files + rename + directory fsync.
5. Write a fresh snapshot to `snapshots/<version>/` and prune older snapshot directories.
6. Append the committed graph to `journal.ndjson` for recovery.
7. On any failure, restore the working tree from the last known good graph before surfacing `PERSIST_FAILED`.

Error behaviors
- `VERSION_CONFLICT (409)`: supplied version is stale; response includes `{ error, current }`.
- `LOCK_TIMEOUT (409)`: lock acquisition exceeded configured timeout.
- `Edge id mismatch (400)`: deterministic id check failed.
- `PERSIST_FAILED (500)`: filesystem writes failed; request rolled back.

Optimistic locking
- `version` increments monotonically. Clients must send the latest version on every POST `/api/graph`. Stale versions receive `409 { error: 'VERSION_CONFLICT', current }`.

Migration tooling
- Convert an existing git-backed working tree by running `pnpm --filter @agyn/platform-server graph:migrate-fs -- --source ./data/graph --target ./data/graph --dataset main` (adjust paths/names as needed).
- The tool copies `graph.meta.yaml`, `nodes/`, `edges/`, `variables.yaml` into the dataset layout, creates an initial snapshot, and renames `.git` to `.git.backup-<timestamp>` for manual archival.

Notes
- YAML remains the only supported on-disk format. Convert any legacy JSON files before pointing the server at them.
- Filename decoding is preserved: if a node/edge YAML omits an explicit `id`, the server derives it from the file name.
