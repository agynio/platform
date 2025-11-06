# Observability Overview

Scope
- Spans and traces for model calls, tool calls, and system operations.
- Storage notes and suggested indices.
- Links to detailed docs in docs/observability/.
 - UI integration via platform-ui with internal tracing routes.

Spans and traces
- The server initializes the observability SDK at startup with default attributes and endpoints.
- Spans include attributes such as `nodeId`, `threadId`, tool/model identifiers, and timing fields. Tool call errors are captured with codes and messages.
- Traces aggregate spans per run; the UI can deep-link into a trace in the Observability UI.

Storage and indices
- The reference implementation stores spans in MongoDB. Suggested indices:
  - Spans by `nodeId`
  - Spans by `traceId`
  - Spans by timestamps (start/end)
  

UI integration
- The platform UI includes tracing views and links using internal routes (e.g., `/tracing/trace/:traceId` and `/tracing/thread/:threadId`).
- The tracing server base is derived from `VITE_API_BASE_URL` with an optional override via `VITE_TRACING_SERVER_URL`. Ensure your server proxies `/tracing` to the tracing-server.

Related docs
- docs/observability/heartbeats-and-sweeper.md
- docs/observability/stage-1-plan.md
- Migration: see CHANGELOG.md for OBS_* -> TRACING_* mapping.

Related behavior
- SDK initialization occurs at server startup; spans are emitted for model/tool calls.
