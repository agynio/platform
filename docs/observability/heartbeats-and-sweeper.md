Observability: Heartbeats and Sweeper

Overview
- SDK sends periodic heartbeats for running spans.
- Server reconciles and cancels spans that miss heartbeats.

SDK Behavior (@agyn/tracing)
- On span start, the SDK begins a timer.
- Every TRACING_HEARTBEAT_MS (default 60s) it POSTs `{ state: 'updated', traceId, spanId }` to `/v1/spans/upsert`.
- On completion or error, the SDK sends `{ state: 'completed', ... }` and stops the timer.

Server Behavior (@agyn/tracing-server)
- Creates an index: `{ completed: 1, lastUpdate: -1 }` (partial on completed=false).
- Sweeper runs every TRACING_SWEEP_INTERVAL_MS (default 60s) and applies:
  - Filter: `{ completed: false, lastUpdate: { $lt: now - TRACING_STALE_TTL_MS } }` (default TTL 5m)
  - Update: set `completed=true`, `status='cancelled'`, `endTime=now`, and push event `{ name:'terminated', attrs:{ reason:'stale_no_heartbeat' } }`.
- On startup, a one-time reconciliation runs when `TRACING_RECONCILE_ON_START=true` (default) to clean up any stale spans after downtime.
 - The termination event contains attrs.by indicating the run context: 'periodic' or 'startup'.

Configuration
- TRACING_HEARTBEAT_MS: SDK heartbeat interval (ms). Default 60000.
  - Set to 0 to disable per-span heartbeats.
- TRACING_STALE_TTL_MS: Server stale TTL for sweeper (ms). Default 300000.
- TRACING_SWEEP_INTERVAL_MS: Server sweep interval (ms). Default 60000.
- TRACING_RECONCILE_ON_START: Run reconciler at server start. Default true.

Notes
- Heartbeat updates are idempotent and lightweight; they only bump `lastUpdate` (and merge attributes if provided).
- The sweeper only affects spans still marked `completed=false`.
