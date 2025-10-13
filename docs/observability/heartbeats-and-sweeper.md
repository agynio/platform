Observability: Heartbeats and Sweeper

Overview
- SDK sends periodic heartbeats for running spans.
- Server reconciles and cancels spans that miss heartbeats.

SDK Behavior (@hautech/obs-sdk)
- On span start, the SDK begins a timer.
- Every OBS_HEARTBEAT_MS (default 60s) it POSTs `{ state: 'updated', traceId, spanId }` to `/v1/spans/upsert`.
- On completion or error, the SDK sends `{ state: 'completed', ... }` and stops the timer.

Server Behavior (@hautech/obs-server)
- Creates an index: `{ completed: 1, lastUpdate: -1 }` (partial on completed=false).
- Sweeper runs every OBS_SWEEP_INTERVAL_MS (default 60s) and applies:
  - Filter: `{ completed: false, lastUpdate: { $lt: now - OBS_STALE_TTL_MS } }` (default TTL 5m)
  - Update: set `completed=true`, `status='cancelled'`, `endTime=now`, and push event `{ name:'terminated', attrs:{ reason:'stale_no_heartbeat' } }`.
- On startup, a one-time reconciliation runs when `OBS_RECONCILE_ON_START=true` (default) to clean up any stale spans after downtime.
 - The termination event contains attrs.by indicating the run context: 'periodic' or 'startup'.

Configuration
- OBS_HEARTBEAT_MS: SDK heartbeat interval (ms). Default 60000.
  - Set to 0 to disable per-span heartbeats.
- OBS_STALE_TTL_MS: Server stale TTL for sweeper (ms). Default 300000.
- OBS_SWEEP_INTERVAL_MS: Server sweep interval (ms). Default 60000.
- OBS_RECONCILE_ON_START: Run reconciler at server start. Default true.

Notes
- Heartbeat updates are idempotent and lightweight; they only bump `lastUpdate` (and merge attributes if provided).
- The sweeper only affects spans still marked `completed=false`.
