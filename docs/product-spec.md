---
title: Product Specification
---

# Hautech Agents — Product Specification

Table of contents
- Overview and personas
- Architecture and components
- Features and capabilities
- Core data model and state
- Behaviors and failure modes
- Security model
- Performance and scale
- Upgrade and migration
- Configuration matrix
- HTTP API and sockets (pointers)
- Runbooks (local dev and compose)
- Release qualification plan
- Glossary and changelog templates (pointers)

Overview and personas
- Graph-driven AI agent platform composing agents, tools, triggers, memory, and MCP servers into a live-updatable LangGraph runtime. The server exposes HTTP APIs and Socket.IO to manage the graph, provision nodes, execute tools, and observe runs. UI offers a builder to configure graphs and view checkpoints/status.
- Personas
  - Agent Builder (developer)
  - Platform Operator (SRE)
  - Integrator (app developer)

Architecture and components
- Runtime
  - Live graph runtime applies versioned diffs serially to a single named graph. PortsRegistry enables reversible edge updates; TemplateRegistry defines template factories, ports, capabilities, and config schemas.
  - Unknown-key handling and retries: apply strips unknown config keys on schema validation errors and retries up to 3 times.
  - Checkpointing via Mongo (default) or Postgres; UI stream currently depends on Mongo change streams.
- Server
  - HTTP APIs and Socket.IO for management and status streaming.
  - Endpoints manage graph templates, graph state, node lifecycle/actions, dynamic-config schema, reminders, runs, vault proxy, and Nix proxy (when enabled).
- Persistence
  - Graph store: Mongo or Git-backed working tree (format: 2) with deterministic edge IDs and advisory lock. Upsert commit per version with conflict/timeout/commit error modes.
  - Container registry: Mongo collection of workspace lifecycle and TTL; cleanup service with backoff.
- Containers and workspace network
  - Workspaces via container provider; labeled hautech.ai/role=workspace and hautech.ai/thread_id; optional hautech.ai/platform for platform-aware reuse. Network: agents_net. Optional DinD sidecar with DOCKER_HOST=tcp://localhost:2375. Optional HTTP-only registry mirror on agents_net.
  - Exec behavior: wall/idle timeouts, abort/kill on timeout, demux, and ANSI stripping.
- Secrets and env overlays
  - Vault optionally resolves vault refs; Env overlays merge static and vault inputs; values never logged; per-node env overlays used for shell and MCP calls only.
- Observability
  - SDK init at server start; spans for model/tool calls; UI checkpoint stream via socket; dedicated services provide storage and UI.

Features and capabilities
- Agents: SimpleAgent graph with scheduling and buffer policies; dynamic summarization; restriction enforcement for tool-first flows.
- Tools: Shell, GitHub clone, Slack, finish, call_agent, manage, remind_me, unified memory tool.
- Triggers: Slack Socket Mode trigger, debug trigger.
- Memory: Memory node/connector or unified memory tool; supports connector placement and scopes.
- MCP: Local server inside workspace container with dynamic tool registration and re-sync; namespace-prefixed tool names; staleness timeout.

Core data model and state
- Graph
  - Nodes: typed by template; static config schema; capabilities (pausable, provisionable, static/dynamic configurable).
  - Edges: deterministic IDs; reversible by PortsRegistry knowledge.
  - Version: monotonically increasing; optimistic locking on apply; single graph “main”.
- Runtime status
  - Per-node paused flag; provision status (not_ready, provisioning, ready, deprovisioning, error); per-node dynamic-config readiness.
- Containers
  - container_id, node_id, thread_id, image, status, last_used_at, kill_after_at, termination_reason, metadata.labels, metadata.platform, metadata.ttlSeconds.
- Observability
  - Spans/traces keyed with nodeId/threadId; checkpoint stream events.

Behaviors and failure modes
- Graph apply
  - VERSION_CONFLICT (409), LOCK_TIMEOUT (409), COMMIT_FAILED (500).
  - Schema validation errors trigger key stripping and up to 3 retries.
- Container exec
  - executionTimeout and idleTimeout produce structured timeouts with captured tail output; optional killOnTimeout stops container. Benign stop/remove errors swallowed (304/404/409).
- MCP
  - Tool call failures normalized with message/code/retriable; transport disconnect to be handled by restart/backoff (planned).
- Slack
  - Filters bot/subtype events; acks envelopes; robust error logging.
- Cleanup
  - Exponential backoff on termination failures (max delay 15m).
- UI caveats
  - UI checkpoint stream requires Mongo; Postgres checkpointer writes aren’t reflected yet.

Security model
- Vault (optional) for secrets; vault endpoints require VAULT_ENABLED. Vault refs used in env overlays; secrets never logged.
- Workspace network isolated; registry mirror HTTP-only and internal to agents_net.
- Env overlays explicit/per-exec; no host env inheritance beyond container defaults.
- API guard against forbidden MCP executable mutations.
- Access control is currently out of scope; assume trusted network.
- See also: docs/security/vault.md and docs/config/env-overlays.md

Performance and scale
- Runtime serializes applies; concurrent applies rejected with 409 on version mismatch.
- Container reuse via registry with TTL reduces cold starts.
- Platform-aware pulls slower on emulation.
- Observability storage relies on Mongo; add indices on spans by nodeId, traceId, timestamps.

Upgrade and migration
- Graph store migration to Git: use the provided migration script — idempotent.
  - Inputs: MONGODB_URL, GRAPH_REPO_PATH, GRAPH_BRANCH, author name/email, optional GRAPH_NAME filter.
  - Output: repo layout with format 2 files.
- UI dependency on Mongo change streams remains until Postgres streaming is added.
- MCP heartbeat/backoff planned; non-breaking once added.
- See: docs/graph/git-store.md

Configuration matrix (server env vars)
- Required
  - GITHUB_APP_ID
  - GITHUB_APP_PRIVATE_KEY (PEM; multiline ok)
  - GITHUB_INSTALLATION_ID
  - OPENAI_API_KEY
  - GH_TOKEN
  - MONGODB_URL (e.g., mongodb://localhost:27017/agents)
- Optional
  - GRAPH_STORE: mongo|git (default mongo)
  - GRAPH_REPO_PATH (required if GRAPH_STORE=git)
  - GRAPH_BRANCH (default graph-state)
  - GRAPH_AUTHOR_NAME / GRAPH_AUTHOR_EMAIL
  - VAULT_ENABLED: true|false (default false)
  - VAULT_ADDR, VAULT_TOKEN
  - DOCKER_MIRROR_URL (default http://registry-mirror:5000)
  - MCP_TOOLS_STALE_TIMEOUT_MS
  - LANGGRAPH_CHECKPOINTER: mongo|postgres (default mongo)
  - POSTGRES_URL (postgres connection string)
  - NIX_* (if Nix proxy enabled)
  - Observability vars in tracing-server (e.g., TRACING_STALE_TTL_MS)
- Derived/labels
  - hautech.ai/role=workspace, hautech.ai/thread_id, optional hautech.ai/platform
  - Optional DOCKER_HOST=tcp://localhost:2375 for DinD

HTTP API and sockets (pointers)
- See docs/api/index.md for request/response examples and error envelopes.
- See docs/graph/status-updates.md for socket event shapes; UI consumption in docs/ui/graph/index.md

Runbooks
- Local dev
  - Prereqs: Node 18+, pnpm, Docker, Mongo.
  - Set: MONGODB_URL, OPENAI_API_KEY, GITHUB_*, GH_TOKEN. Optional VAULT_* and DOCKER_MIRROR_URL.
  - Start deps (compose or local Mongo)
  - Server: pnpm -w -F @agyn/platform-server dev
  - UI: pnpm -w -F @agyn/platform-ui dev
  - Verify: curl http://localhost:3010/api/templates; open UI; connect socket to observe node_status when provisioning.
 - Docker Compose stack
  - Services: mongo, mongo-express, vault (auto-init), postgres, registry-mirror.
  - Observability: This repo does not include Jaeger in compose. Use the provided observability services (ports 4319 and 4320) for storage and UI. Quickstart:
    - `pnpm --filter @agyn/tracing-server dev` (or build+start)
    - `pnpm --filter @agyn/tracing-ui dev` (or build+start)
  - Vault init: vault/auto-init.sh populates root token/unseal keys; set VAULT_ENABLED=true and VAULT_ADDR/VAULT_TOKEN.
  - Postgres checkpointer: set LANGGRAPH_CHECKPOINTER=postgres and POSTGRES_URL; UI stream caveat remains.

Release qualification plan
- Pre-flight config
  - Validate required env vars; verify graph store; if VAULT_ENABLED, verify connectivity and token.
- Functional smoke
  - /api/templates returns expected templates.
  - Create trivial graph with containerProvider + shell tool; exec simple command with execution+idle timeouts; verify timeouts.
  - Add MCP server node; list and invoke a trivial tool; verify namespacing.
  - Add Slack trigger (with Vault); send message; verify trigger delivery and agent run.
- Persistence
  - Git store: apply small diff twice (idempotent); stale baseVersion returns 409.
  - Mongo/Postgres checkpointers: run agent loop; verify spans/checkpoints; note UI stream caveat in Postgres.
- Container lifecycle
  - Verify TTL and cleanup job removes expired containers; simulate removal error and observe backoff.
  - Verify platform-aware reuse and relabeling.
- Observability
  - Confirm spans for model/tool calls; UI links to tracing-ui via VITE_TRACING_UI_BASE.

Glossary and templates
- Glossary: docs/glossary.md
- Changelog template: docs/CHANGELOG_TEMPLATE.md
