# Observability Overview

Scope
- Spans and traces for model calls, tool calls, and system operations.
- Storage notes and suggested indices.
- Links to detailed docs in docs/observability/.
- UI linkage via VITE_OBS_UI_BASE.

Spans and traces
- The server initializes the observability SDK at startup with default attributes and endpoints.
- Spans include attributes such as `nodeId`, `threadId`, tool/model identifiers, and timing fields. Tool call errors are captured with codes and messages.
- Traces aggregate spans per run; the UI can deep-link into a trace in the Observability UI.

Storage and indices
- The reference implementation stores spans in MongoDB (packages/obs-server). Suggested indices:
  - Spans by `nodeId`
  - Spans by `traceId`
  - Spans by timestamps (start/end)
- See packages/obs-server/README.md for storage behavior and packages/obs-server/src/server.ts for server wiring.

UI linkage
- The graph UI can link to a trace in the Observability UI via the base configured in `VITE_OBS_UI_BASE` (default http://localhost:4320). Set this in apps/ui environment.

Related docs
- docs/observability/heartbeats-and-sweeper.md
- docs/observability/stage-1-plan.md

Related code
- packages/obs-sdk
- packages/obs-server
- packages/obs-ui
- apps/server/src/index.ts (obs-sdk init)

