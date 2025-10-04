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
- POST /v1/traces (Stage 1 JSON placeholder)
- /healthz, /readyz
