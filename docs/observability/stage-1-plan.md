# Observability Stage 1 — Plan (SDK + Server + PoC)

Authoritative scope for Issue #82. Dev/local only, no auth or rate limiting. Minimal filters.

Changes (update):
- No Docker compose; run server from sources via pnpm scripts.
- Example moved into its own package `@agyn/obs-examples`.

Run server from sources
- Prereqs: Node 20+, MongoDB available (default MONGO_URL=mongodb://localhost:27017/obs)
- Dev: `pnpm --filter @agyn/tracing-server dev`
- Build + start: `pnpm --filter @agyn/tracing-server build && pnpm --filter @agyn/tracing-server start`
- Endpoints: /healthz, /readyz, POST /v1/spans/upsert, GET /v1/spans, GET /v1/spans/:id, POST /v1/traces (JSON placeholder in Stage 1)

Example package
- Example scripts are provided to exercise the observability APIs.
- Dev: `pnpm --filter @agyn/obs-examples dev`
- Build + run: `pnpm --filter @agyn/obs-examples build && pnpm --filter @agyn/obs-examples start`
- Env: `TRACING_SERVER_URL` (default http://localhost:4319)

Linking from Builder UI (Activity panel)
- The Builder UI can deep-link to the Observability UI using `VITE_TRACING_UI_BASE` (default http://localhost:4320).
- The Activity panel displays recent agent/tool spans for the selected node and links to `/trace/:traceId` on the Observability UI.
- Ensure spans include `nodeId` so filtering is accurate.

Scope
- Observability services and UI are provided as separate components. Docker compose is optional/orthogonal to local dev and not required for Stage 1.

The rest of the plan remains unchanged: minimal filters, status transitions, index strategy, and acceptance criteria.
