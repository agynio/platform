# Agents Technical Documentation

This document provides a comprehensive, developer-focused overview of the Agents repository. It describes the runtime model, graph-based architecture, key flows, configuration, and development practices so new contributors can quickly become effective.

Table of contents
- Project Overview
- High-Level Architecture
- Key Flows
- Configuration & Dependencies
- How to Develop & Test
- Conversation summarization
- Security & Ops Notes
- Glossary

1. Project Overview
- Purpose: A TypeScript runtime and UI for building and operating graph-driven AI agents using LangGraph. The system composes Agents, Tools, Triggers, and external MCP servers into a live, reversible graph that can be updated at runtime.
- Primary use cases:
  - Operate agent graphs that react to external events (Slack messages, PR updates) and call tools (bash, GitHub, Slack) and MCP tools inside containers.
  - Persist graph definitions to a Git-backed repository and apply diffs live without restarts.
  - Stream checkpoint writes to an interactive UI for observability.
- Pipeline phases:
  - Persisted graph fetch/validate -> Live graph apply (diff) -> Runtime execution (triggers -> agent graph -> tools) -> Checkpoint stream.
  - Parallelism: Graph diff/apply serializes graph mutations (to keep consistency), while operations inside nodes/tools (e.g., tool execution, network IO) run concurrently.
- Notes on implementation entry points:
  - Server bootstrap initializes routes and sockets.
  - Live graph runtime manages diffs and reversible edges.
  - Template registry provides factories, ports, and schemas.
  - Triggers, tools, and MCP compose the runtime surface.

2. High-Level Architecture
Design principles
- Idempotent, reversible graph edges: All connections are made via declared ports with create/destroy symmetry.
- Minimal global state: Nodes own their state; graph runtime orchestrates instantiation and connections.
- Live-updatable: Apply diffs to add/remove/update nodes and edges safely.
- Composition over reflection: Ports registry explicitly declares allowed connections to avoid brittle reflection.
- Container isolation per thread: Tools and MCP operations run in per-thread containers to isolate state.

Layers
- Application server: wires services, loads persisted graph, exposes minimal REST (templates/graph) and a Socket.IO stream for checkpoints.
- Graph runtime: live diff/apply engine enforcing reversible edges via ports and template registries.
- Templates: declarative registration of node factories and their ports.
- Triggers: external event sources (Slack, PR polling) that push messages into agents.
- Nodes: graph components like LLM invocation and memory.
- Tools: actions callable by the LLM (bash, GitHub clone, Slack message) and adapters.
- MCP: local server inside a workspace container with transport over docker exec.
- Services: infra clients and helpers (config, docker container provision, Prisma/Postgres, Slack, GitHub, checkpointer, sockets).

3. Key Flows

Thread messaging pipeline
- ThreadOutboxService is the single write path for assistant-authored messages. Tools (send_message) and the agent auto-send flag call it with threadId, runId, source metadata, and optional prefix.
- ChannelRouter validates the persisted Thread.channel descriptor and resolves the concrete adapter. It surfaces failures immediately (no retry or deduplication) and returns errors such as missing adapters.
- Slack routes call SlackAdapter, which locates the SlackTrigger node recorded as channelNodeId and delegates delivery via SlackTrigger.sendToChannel using the stored descriptor.
- Manage routes call ManageAdapter.computeForwardingInfo. The adapter builds the forwarded text (including prefixes/correlation metadata) and ChannelRouter hands it to AgentIngressService, which enqueues the message directly to the parent agent—no external adapters (Slack, etc.) are involved.
- AgentsPersistenceService stamps inbound author roles: injected or ingress messages become `user`, while ThreadOutboxService (including Manage forwards) stores `assistant`.
- Agents expose a static config toggle **Send LLM response to thread** (default `true`). When enabled the final model reply for a run is persisted through ThreadOutboxService with source `auto_response`.

Workspace container platform
- containerProvider.staticConfig.platform: Optional; enum of `linux/amd64` or `linux/arm64`.
- Behavior: When set, `docker pull` includes the platform selector and `docker.createContainer` receives `platform` as a query parameter. New containers are labeled with `hautech.ai/platform`.
- Reuse rules: If a platform is requested and an existing container found by labels has a different or missing `hautech.ai/platform` label, it is not reused; the old container is stopped and removed, and a new one is created.
- Source of truth: We do not infer platform from image architecture or variant, and we do not normalize values. The requested enum (`linux/amd64` or `linux/arm64`) and the `hautech.ai/platform` label are the only source of truth for reuse decisions.
- Error handling: On stop/remove during mismatch cleanup, benign 304/404 errors are swallowed; only unexpected status codes bubble up.
- Example:
  - platform: linux/amd64
  - image: node:20
  - env: { FOO: "bar" }
- Note: Docker Desktop generally supports both platforms; non-native emulation may be slower (qemu/binfmt). Not all tags are multi-arch; prefer multi-arch images when specifying platform.

Per-workspace Docker-in-Docker and registry mirror
- Each workspace container can be created with DOCKER_HOST=tcp://localhost:2375 and a co-located Docker-in-Docker sidecar (docker:27-dind) running in the same network namespace (HostConfig.NetworkMode=container:<workspaceId>), with privileged=true and an anonymous volume for /var/lib/docker.
- The sidecar exposes its Docker API only inside the workspace namespace; port 2375 is not published on the host.
- A lightweight pull-through cache is provided via a compose service `registry-mirror` (registry:2 in proxy mode) on a shared bridge network `agents_net`.
- The mirror is HTTP-only and reachable only within `agents_net` by name `registry-mirror`.
- DinD is started with `--registry-mirror` pointing at DOCKER_MIRROR_URL (default http://registry-mirror:5000), so image pulls inside workspaces use the proxy cache.
- Readiness: the server waits for the DinD engine to be ready before executing any initial scripts.
- To override the mirror, set environment variable `DOCKER_MIRROR_URL` to an alternate URL.

Defaults and toggles
- LiveGraphRuntime serializes apply operations by default.
- PRTrigger intervalMs default 60000; includeAuthored default false.
- MCP restart defaults: maxAttempts 5; backoffMs 2000.

How to Develop & Test
- Prereqs: Node.js 20+, pnpm 9+, Docker, Postgres
- Run server: pnpm --filter @agyn/platform-server dev
- Tests: pnpm --filter @agyn/platform-server test
