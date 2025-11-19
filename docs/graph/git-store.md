# Git-backed Graph Store (format: 2)

Overview
- Git-backed persistence stores the single graph in a repository working tree with a root-level, per-entity layout (format: 2).
- Deterministic edge IDs, advisory file lock, and serial, idempotent upserts.

Repository layout (root)
- graph.meta.json: `{ name, version, updatedAt, format: 2 }`
- nodes/: one JSON per node — `nodes/<urlencoded nodeId>.json`
- edges/: one JSON per edge — `edges/<urlencoded edgeId>.json`

Deterministic edge IDs
- ID = `${source}-${sourceHandle}__${target}-${targetHandle}`
- On upsert, if a provided edge.id does not match this deterministic form, the request fails with HTTP 400. The response body contains the error message, for example: `{ error: 'Edge id mismatch: expected <id> got <id>' }`.

Lifecycle and apply flow
1) Validate request against template registry (unknown config keys stripped on runtime apply, not in persistence).
2) Acquire advisory lock `.graph.lock` at repo root with a timeout (default 5s). If lock cannot be acquired in time, respond with `LOCK_TIMEOUT`.
3) Read existing state from working tree or HEAD fallback; compute normalized nodes/edges with deterministic edge IDs.
4) Compute deltas; write changed node/edge files and meta atomically (temp files + rename + fsync).
5) `git add --all` changed paths; `git commit` with author from headers or default author. On commit failure, rollback touched paths and return `COMMIT_FAILED`.
6) Return the persisted graph with incremented version.

Error behaviors
- VERSION_CONFLICT (409): version mismatch with current HEAD/meta.
- LOCK_TIMEOUT (409): could not acquire advisory lock within timeout.
- Edge id mismatch (400): supplied edge id does not match deterministic id; surfaced as a descriptive error message in the body.
- COMMIT_FAILED (500): git commit failure.

Optimistic locking
- The `version` field is monotonically increasing. POST `/api/graph` must include the current version; stale versions return 409 with `{ error: 'VERSION_CONFLICT', current }`.

Working tree recovery
- If working tree is partially written or corrupt, service falls back to last committed snapshot (HEAD) or the previous in-memory snapshot.

Example commands
```bash
# Validate templates
curl http://localhost:3010/api/templates

# Inspect current graph
curl http://localhost:3010/api/graph

# Save a no-op graph (expects correct version)
curl -X POST http://localhost:3010/api/graph \
  -H 'content-type: application/json' \
  -H 'x-graph-author-name: Jane Dev' \
  -H 'x-graph-author-email: jane@example.com' \
  -d '{"name":"main","version":1,"nodes":[],"edges":[]}'

```

Related behavior
- Server manages persistence, routing, and error handling for the Git-backed store.
