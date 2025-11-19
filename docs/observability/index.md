# Observability Overview

> NOTE: The dedicated tracing stack has been removed from the platform. The details below remain for historical reference only.

Scope
- Spans and traces for model calls, tool calls, and system operations.
- Storage notes and suggested indices.
- Links to detailed docs in docs/observability/.
- Former UI linkage relied on a tracing UI base URL; this integration is now retired.

Spans and traces
- The server initializes the observability SDK at startup with default attributes and endpoints.
- Spans include attributes such as `nodeId`, `threadId`, tool/model identifiers, and timing fields. Tool call errors are captured with codes and messages.
- Traces aggregate spans per run; the UI can deep-link into a trace in the Observability UI.

Storage and indices
- The reference implementation stores spans in Postgres (JSONB). Suggested indices:
  - Spans by `nodeId`
  - Spans by `traceId`
  - Spans by timestamps (start/end)
  

UI linkage
- The platform UI no longer links to a dedicated tracing application. Historical references to the tracing UI base are obsolete.

Related docs
- docs/observability/heartbeats-and-sweeper.md
- docs/observability/stage-1-plan.md
- Migration: see CHANGELOG.md for historical environment variable mapping between obs_* and tracing equivalents.

Related behavior
- SDK initialization occurs at server startup; spans are emitted for model/tool calls.
