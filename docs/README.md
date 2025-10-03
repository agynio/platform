# Agents Documentation

- Technical Overview: [technical-overview.md](technical-overview.md)
- Contributing: [contributing/index.md](contributing/index.md)
- Style Guides: [contributing/style_guides.md](contributing/style_guides.md)
- MCP Design: [mcp-design.md](mcp-design.md)

## Recent Additions

- Container Provider now supports an optional `initialScript` configuration field. When set, the script is executed inside a newly created container immediately after it starts (via `/bin/sh -lc`). A non-zero exit code fails provisioning of that container.
- Simple Agent now accepts a `model` static configuration parameter to select the underlying LLM (default: `gpt-5`). You can override it per agent instance via the graph static config UI or API.

## Invoke Resolution Semantics

Agent-side buffering and scheduling determines when `agent.invoke()` resolves:
- whenBusy=`wait` + processBuffer=`oneByOne`: each invocation resolves after the run that processes its single message completes. If that run errors, only that invocation rejects.
- whenBusy=`wait` + processBuffer=`allTogether`: all invocations drained into a batch resolve together when that batch's run completes (or reject together on error).
- whenBusy=`injectAfterTools`: invocations arriving while a run is in-flight are injected into that run after tools and resolve when that run completes. Calls arriving too late to be injected remain queued for the next run and resolve then.

On errors thrown by the graph runtime, only awaiters associated with the failed run are rejected; buffered invocations not yet included remain pending for the next run. Each run is tagged with a per-run identifier in logs for easier tracing.
