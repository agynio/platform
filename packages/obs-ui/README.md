# @hautech/obs-ui

Minimal Observability UI (Stage 1)

## Dev

```
pnpm --filter @hautech/obs-ui dev
```

Env variables:
- `VITE_OBS_SERVER_URL` (default `http://localhost:4319`)

## Pages
- `/` traces list (derived from spans)
- `/trace/:traceId` trace explorer
  - Left: span tree (30%)
  - Right: timeline or selected span details

## Future Enhancements
- Server-side trace aggregation endpoint
- Live updates via polling / SSE
- Search & filters
- Dark mode

