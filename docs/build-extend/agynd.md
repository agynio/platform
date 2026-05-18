---
title: agynd
description: The wrapper daemon every agent CLI runs under.
order: 6
---

# agynd

`agynd` is the wrapper daemon that runs inside every agent workload. It bridges any agent CLI with the platform — fetching configuration, exporting an LLM endpoint, writing tool configs, posting messages, acknowledging messages, sending keepalives. Agent CLIs do not need to know anything about the platform; they just speak to the LLM and tools `agynd` set up.

Source: [`agynio/agynd-cli`](https://github.com/agynio/agynd-cli).

Most users never interact with `agynd` directly. This page is for people implementing a custom agent CLI or debugging workload startup.

## Where it runs

`agynd` is the entrypoint of the runtime container in every agent workload. The init container copies it into `/agyn-bin/agynd`; the runtime container's entrypoint is set to run it.

The runtime container's image is the dev container you picked when creating the agent — `agynd` does not require any base image, only that the binaries it copies in are runnable.

## Startup sequence

1. **Identity.** Read `AGENT_ID` from the environment. The Ziti sidecar already holds the agent's OpenZiti identity — outbound calls to `gateway.ziti` and `llm-proxy.ziti` are mTLS-authenticated transparently.
2. **Fetch agent configuration.** Call Gateway:
   - `GetAgent` — base configuration.
   - `ListSkills` — written to `/skills/<name>.md`.
   - `ListMCPs` — used to build the agent CLI's MCP config file.
   - `ListInitScripts` — executed in order.
3. **Run init scripts.** Each script runs in `$WORKSPACE_DIR` (or `/tmp` if unset) with all ENVs available (plain and secret-backed, injected by the orchestrator at workload creation).
4. **Export LLM endpoint.** Set `OPENAI_API_BASE` / `ANTHROPIC_API_URL` to `http://llm-proxy.ziti:<port>/v1` and supply a synthetic API key. The agent CLI's HTTP client uses this without needing to know about the platform.
5. **Write MCP config.** For Codex / Claude Code, write the appropriate `mcp.json` or equivalent. For custom CLIs, write a config file at `$AGYND_MCP_CONFIG`.
6. **Wait for the first unacknowledged message.** Subscribe to `thread_participant:me` notifications via Gateway, then pull the unacknowledged message list with `GetUnackedMessages`.
7. **Spawn the agent CLI.** Pass the message body via stdin / file (CLI-specific). Stream stdout back as outgoing thread messages.
8. **Acknowledge processed messages.** Once the CLI finishes a turn, call `AckMessages` so the orchestrator knows the agent has caught up.
9. **Keepalive.** While the CLI is producing output, call `TouchWorkload` every 10s. The orchestrator uses `last_activity_at` for [idle timeout](../administer/agents.md#idle-timeout).
10. **Exit on idle.** When the CLI exits or after the idle timeout, `agynd` shuts down cleanly. The orchestrator notices the workload has stopped and updates the runtime state.

## Environment variables

`agynd` reads:

| Variable | Purpose |
|---|---|
| `AGENT_ID` | Required. Agent's UUID. |
| `WORKSPACE_DIR` | Optional. Where init scripts run. Default `/tmp`. |
| `AGYND_LOG_LEVEL` | Optional. `debug`, `info`, `warn`, `error`. Default `info`. |

`agynd` exports for the agent CLI:

| Variable | Purpose |
|---|---|
| `OPENAI_API_BASE` (or equivalent) | Points at LLM Proxy. |
| `OPENAI_API_KEY` (or equivalent) | Synthetic key — LLM Proxy does its own auth. |
| `AGYND_MCP_CONFIG` | Path to the MCP config file written for custom CLIs. |
| Skills directory `/skills/` | Mounted with each skill as a file. |
| User-defined ENVs | Plain values and resolved secret values, set by the orchestrator at workload creation. |

## How agynd talks to the platform

All calls go through Gateway over OpenZiti (the Ziti sidecar in the pod). `agynd` does not require additional credentials — the pod's OpenZiti identity is the agent's identity. Authorization checks happen server-side based on that identity.

| Direction | Method | Used for |
|---|---|---|
| `agynd` → Gateway → Agents | `GetAgent`, `ListSkills`, `ListMCPs`, `ListInitScripts` | Configuration fetch. |
| `agynd` → Gateway → Notifications | `Subscribe(thread_participant:me)` | Server-streaming events. |
| `agynd` → Gateway → Threads | `GetUnackedMessages`, `SendMessage`, `AckMessages` | Per-message I/O. |
| `agynd` → Gateway → Runners | `TouchWorkload` | Keepalive. |
| `agynd` → LLM Proxy | `POST /v1/responses` or `/v1/messages` | Forwarded LLM calls (via the agent CLI). |
| `agynd` → Tracing proxy (`localhost:4317`) | OTLP gRPC | Spans emitted by the agent CLI; injected with thread/workload context. |

## Tracing proxy

`agynd` runs a small OTLP gRPC proxy on `localhost:4317`. The agent CLI exports spans to this proxy (set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317`). The proxy decorates spans with thread, workload, and agent identifiers, then forwards to the Tracing service over `tracing.ziti`.

This is how the [Run Timeline](../use/run-timeline.md) gets its data without each agent CLI needing to know the platform's tracing setup.

## Failure handling

If `agynd` fails before spawning the CLI:

- Gateway calls fail → exits with non-zero, runtime container restarts up to its restart limit. Workload transitions to `failed` with reason `start_failed` or `config_invalid`.
- Init scripts fail → same as above.

If the CLI crashes mid-turn, `agynd` does not retry — it lets the orchestrator's start-decision policy handle reconciliation on the next message. Messages already partially-acknowledged stay acknowledged.

## Custom CLI integration

If you implement a custom CLI, your binary lives at `/agyn-bin/cli/<name>` and is spawned by `agynd`'s startup script. Honor the LLM and MCP environment variables `agynd` exports; everything else (auth, network, message I/O) is handled for you.

See [Agent CLIs → Writing a custom CLI](./agent-clis.md#writing-a-custom-cli) for the full integration guide.

## Related

- [Agent CLIs](./agent-clis.md)
- [Administer → Agents](../administer/agents.md)
- [Gateway API](./gateway-api.md)
- [Use → Run Timeline](../use/run-timeline.md)
