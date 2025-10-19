# @agyn/obs-examples

Example scripts for Observability Stage 1.

Run (no Docker):
- Ensure @agyn/tracing-server is running locally (PORT default 4319)
- Dev from sources: `pnpm --filter @agyn/obs-examples dev`
- Build + start: `pnpm --filter @agyn/obs-examples build && pnpm --filter @agyn/obs-examples start`

Env:
- `TRACING_SERVER_URL` (default: http://localhost:4319)
