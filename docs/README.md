# Agents Documentation

- Technical Overview: [technical-overview.md](technical-overview.md)
- Contributing: [contributing/index.md](contributing/index.md)
- Style Guides: [contributing/style_guides.md](contributing/style_guides.md)
- MCP Design: [mcp-design.md](mcp-design.md)

## Recent Additions

- Workspace container provider supports an optional `platform` static field with allowed values `linux/amd64` or `linux/arm64`. When set, Docker image pulls include the platform selector and container creation uses the same platform (as a query parameter). Newly created containers are labeled with `hautech.ai/platform` for future reuse decisions. If a workspace is requested with a platform and an existing container has a different or missing platform label, it will not be reused; it is stopped and removed, and a new one is created. Note: Running a non-native platform may be slower depending on Docker's emulation.
- Container Provider supports an optional `initialScript` configuration field. When set, the script is executed inside a newly created container immediately after it starts (via `/bin/sh -lc`). A non-zero exit code fails provisioning of that container.
- Simple Agent now accepts a `model` static configuration parameter to select the underlying LLM (default: `gpt-5`). You can override it per agent instance via the graph static config UI or API.

## Invoke Resolution Semantics

Agent-side buffering and scheduling determines when `agent.invoke()` resolves:
- whenBusy=`wait` + processBuffer=`oneByOne`: resolves per message/run; if a run fails, only that message's awaiter rejects. Tokens split across runs resolve independently.
- whenBusy=`wait` + processBuffer=`allTogether`: resolves all included together when the batch's run completes; rejects together on error.
- whenBusy=`injectAfterTools`: messages arriving during an in-flight run are injected after tools and resolve when that run completes; arrivals too late to inject remain queued for the next run.

On errors thrown by the graph runtime, only tokens included in the failed run are rejected; others remain pending. `dropTokens()` cleans up any remaining buffered items for those tokens. Each run is tagged with a per-run identifier in logs for easier tracing.

Note: Running a non-native platform may be slower depending on Docker Engine/Desktop emulation (qemu/binfmt). Not all image tags are multi-arch; prefer multi-arch images when specifying platform.
