# Observability Stage 1 — Plan (SDK + Server + PoC)

Authoritative scope for Issue #82. Dev/local only, no auth or rate limiting. Minimal filters.

Changes (update):
- No Docker compose; run server from sources via pnpm scripts.
- Example moved into its own package `@hautech/obs-examples`.

Run server from sources
- Prereqs: Node 18+, MongoDB available (default MONGO_URL=mongodb://localhost:27017/obs)
- Dev: `pnpm --filter @hautech/obs-server dev`
- Build + start: `pnpm --filter @hautech/obs-server build && pnpm --filter @hautech/obs-server start`
- Endpoints: /healthz, /readyz, POST /v1/spans/upsert, GET /v1/spans, GET /v1/spans/:id, POST /v1/traces (JSON placeholder in Stage 1)

Example package
- `@hautech/obs-examples` contains PoC script under `src/poc.ts`.
- Dev: `pnpm --filter @hautech/obs-examples dev`
- Build + run: `pnpm --filter @hautech/obs-examples build && pnpm --filter @hautech/obs-examples start`
- Env: `OBS_EXTENDED_ENDPOINT` (default http://localhost:4319)

Linking from Builder UI (Activity panel)
- The Builder UI (apps/ui) can deep-link to the Observability UI using `VITE_OBS_UI_BASE` (default http://localhost:4320).
- The Activity panel displays recent agent/tool spans for the selected node and links to `/trace/:traceId` on the Observability UI.
- Ensure spans include `nodeId` so filtering is accurate.

The rest of the plan remains unchanged: minimal filters, status transitions, index strategy, and acceptance criteria.
