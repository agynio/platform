# @hautech/obs-server

Fastify + Mongo service for Observability Stage 1. Dev/local only; no auth or rate limiting.

Run locally (no Docker):
- Prereqs: Node 18+, MongoDB running (default URL: mongodb://localhost:27017/obs)
- Dev from sources: `pnpm --filter @hautech/obs-server dev`
  - Env: `MONGO_URL` (default `mongodb://localhost:27017/obs`), `PORT` (default `4319`)
- Build + start: `pnpm --filter @hautech/obs-server build && pnpm --filter @hautech/obs-server start`

Endpoints:
- POST /v1/spans/upsert
- GET /v1/spans
- GET /v1/spans/:id
- GET /v1/metrics/errors-by-tool
- POST /v1/traces (Stage 1 JSON placeholder)
- /healthz, /readyz

Spans query limits:
- Default limit: 50
- Max limit: 5000 (increased from 100 for large traces / development). Use responsibly: large payloads can impact UI performance and network time. Prefer pagination for extremely large datasets.

Metrics
- GET /v1/metrics/errors-by-tool
  - Query params:
    - from (ISO, default now-6h)
    - to (ISO, default now)
    - limit (default 50, max 1000)
    - field ('lastUpdate'|'startTime', default 'lastUpdate')
  - Aggregation: match status=error AND label /^tool:/ AND time window on field; group by label with count; sort by count desc; limit.
  - Response: { items: Array<{ label: string; count: number }>, from, to }
  - Indexing note: this query is served efficiently by compound/simple indexes on
    - { status: 1, lastUpdate: -1 }
    - { startTime: -1 }
    The pipeline first filters by time and status, making the subsequent label /^tool:/ match cheap before grouping.
