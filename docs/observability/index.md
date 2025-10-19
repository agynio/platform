# Observability Overview

Scope
- Spans and traces for model calls, tool calls, and system operations.
- Storage notes and suggested indices.
- Links to detailed docs in docs/observability/.
- UI linkage via VITE_TRACING_UI_BASE.

Spans and traces
- The server initializes the observability SDK at startup with default attributes and endpoints.
- Spans include attributes such as `nodeId`, `threadId`, tool/model identifiers, and timing fields. Tool call errors are captured with codes and messages.
- Traces aggregate spans per run; the UI can deep-link into a trace in the Observability UI.

Storage and indices
- The reference implementation stores spans in MongoDB. Suggested indices:
  - Spans by `nodeId`
  - Spans by `traceId`
  - Spans by timestamps (start/end)
  

UI linkage
- The graph UI can link to a trace in the Observability UI via the base configured in `VITE_TRACING_UI_BASE` (default http://localhost:4320). Set this in the UI environment.

Related docs
- docs/observability/heartbeats-and-sweeper.md
- docs/observability/stage-1-plan.md
- Migration: see CHANGELOG.md for OBS_* -> TRACING_* mapping.

Related behavior
- SDK initialization occurs at server startup; spans are emitted for model/tool calls.
