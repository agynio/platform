Observability: Heartbeats and Sweeper

> **Archived:** Heartbeat and sweeper behavior applied to the deprecated tracing stack. These mechanics were removed alongside tracing in issue #760.

Overview
- SDK sends periodic heartbeats for running spans.
- Server reconciles and cancels spans that miss heartbeats.

Legacy SDK behavior
- On span start, the SDK began a timer.
- Heartbeats were emitted roughly every 60 seconds via POST `/v1/spans/upsert` with `{ state: 'updated', traceId, spanId }`.
- On completion or error, the SDK sent `{ state: 'completed', ... }` and cleared the timer.

Legacy server behavior
- Created an index `{ completed: 1, lastUpdate: -1 }` (partial on completed=false).
- A sweeper periodically processed spans older than a configurable TTL, marking them cancelled and closing them out.
- On startup, an optional reconciliation pass cleaned up stale spans remaining after downtime.

Legacy configuration knobs
- Heartbeat interval (milliseconds) controlled how frequently the SDK pinged the server.
- Stale TTL defined how long a running span could go without heartbeats before the sweeper cancelled it.
- Sweep interval controlled how often the sweeper executed.
- A boolean toggle determined whether the reconciler ran at server startup.

Notes
- Heartbeat updates are idempotent and lightweight; they only bump `lastUpdate` (and merge attributes if provided).
- The sweeper only affects spans still marked `completed=false`.
