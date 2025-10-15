# Agents Documentation

- Technical Overview: [technical-overview.md](technical-overview.md)
- Contributing: [contributing/index.md](contributing/index.md)
- Style Guides: [contributing/style_guides.md](contributing/style_guides.md)
- MCP Design: [mcp-design.md](mcp-design.md)
- Slack migration: [slack-migration.md](slack-migration.md)

## Refactor Direction

This repository is converging on a single Node lifecycle and unified nodes structure.

- Lifecycle and semantics: [LIFECYCLE.md](LIFECYCLE.md)
- Architecture conventions: [ARCHITECTURE.md](ARCHITECTURE.md)
- Migration plan: [MIGRATION.md](MIGRATION.md)

Key decisions:
- Single Node interface: `configure()`, `start()`, `stop()`, `delete()`; all methods idempotent with explicit allowed calls per state.
- Everything is a Node and lives under `apps/server/src/nodes/` (tools, triggers, workspace provider, MCP servers, memory, agents, etc.).
- Agent-as-Node: Agents implement the same lifecycle; constructors are DI-only; `start()` performs setup/compilation; existing scheduling/buffering is retained.
- Templates must be pure: construct nodes only; lifecycle is managed by orchestration.

## Recent Additions

- Workspace container provider supports an optional `platform` static field with allowed values `linux/amd64` or `linux/arm64`. When set, Docker image pulls include the platform selector and container creation uses the same platform (as a query parameter). Newly created containers are labeled with `hautech.ai/platform` for future reuse decisions. If a workspace is requested with a platform and an existing container has a different or missing platform label, it will not be reused; it is stopped and removed, and a new one is created. Note: Running a non-native platform may be slower depending on Docker's emulation.
- Container Provider supports an optional `initialScript` configuration field. When set, the script is executed inside a newly created container immediately after it starts (via `/bin/sh -lc`). A non-zero exit code fails provisioning of that container.
- Simple Agent now accepts a `model` static configuration parameter to select the underlying LLM (default: `gpt-5`). You can override it per agent instance via the graph static config UI or API.
  - Also configurable: agent-side message buffer handling for SimpleAgent (static config fields in apps/server/src/agents/simple.agent.ts):
    - debounceMs: Debounce window (ms) for agent-side message buffer.
    - whenBusy: 'wait' queues new messages; 'injectAfterTools' injects them into the current run after the tools stage.
    - processBuffer: 'allTogether' drains all queued messages; 'oneByOne' processes one message per run.
  - Defaults: `debounceMs=0`, `whenBusy='wait'`, `processBuffer='allTogether'`.
  - Changes made via `setConfig({...})` apply immediately at runtime without a restart; the agent updates scheduling and summarization behavior in-place.

## Invoke Resolution Semantics

Agent-side buffering and scheduling determines when `agent.invoke()` resolves:
- whenBusy=`wait` + processBuffer=`oneByOne`: resolves per message/run; if a run fails, only that message's awaiter rejects. Tokens split across runs resolve independently.
- whenBusy=`wait` + processBuffer=`allTogether`: resolves all included together when the batch's run completes; rejects together on error.
- whenBusy=`injectAfterTools`: messages arriving during an in-flight run are injected after tools and resolve when that run completes; arrivals too late to inject remain queued for the next run.

On errors thrown by the graph runtime, only tokens included in the failed run are rejected; others remain pending. `dropTokens()` cleans up any remaining buffered items for those tokens. Each run is tagged with a per-run identifier in logs for easier tracing.

Notes: Running a non-native platform may be slower depending on Docker Engine/Desktop emulation (qemu/binfmt); your Docker Engine must support the requested platform; and not all registries publish multi-arch images for the same tag.
When platform is undefined, we do not set the `hautech.ai/platform` label and reuse behavior remains unchanged.
