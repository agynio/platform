---
title: Hooks
description: Event-driven sidecars attached to an agent.
order: 9
---

# Hooks

A hook is a small program — packaged as a container image — that runs in response to a platform event for the agent. Hooks live as sidecars in the agent's pod and are managed by `agynd`.

Use hooks when you need behavior that responds to events outside the agent's main reasoning loop: pre- or post-LLM-call processing, message rewriting, custom telemetry, or external sync.

## Hook events

| Event | When it fires |
|---|---|
| `message.received` | A new message arrives in the agent's thread. Fires before the agent processes it. |
| `message.sent` | The agent posts a response. Fires after the message is acknowledged. |
| `llm.before` | About to make an LLM call. Hook can read and modify context. |
| `llm.after` | An LLM call returned. Hook can read the response. |
| `tool.before` | About to execute a tool. |
| `tool.after` | A tool returned. |
| `run.start` / `run.end` | Run lifecycle boundaries. |

The exact event list is versioned in the [API contracts](../reference/api.md). Not every agent CLI fires every event — see the CLI's documentation.

## Add a hook

### In the Console

1. Console → **Agents → <agent>** → **Hooks** tab.
2. Click **New hook**.
3. Set:
   - **Name** — unique within the agent.
   - **Event** — one of the events above.
   - **Image** — container image to run.
   - **Entrypoint** — optional override.
   - **Compute resources** — CPU/memory.
   - **Environment variables** — plain values and [secret references](./environment-variables.md).
   - **Init scripts** — pre-start setup.
4. Save.


### With Terraform

```hcl
resource "agyn_agent_hook" "audit_logger" {
  agent_id = agyn_agent.support.id

  name  = "audit-logger"
  event = "message.sent"
  image = "ghcr.io/acme/agyn-audit-hook:latest"

  envs = [
    {
      name      = "AUDIT_BUCKET_URL"
      secret_id = agyn_secret.audit_bucket.id
    },
  ]
}
```

## What a hook can do

A hook receives the event payload over its standard input or HTTP endpoint (depending on the agent CLI). It returns a result that may modify or veto the event. Specific semantics depend on the CLI — Codex, Claude Code, and `agn` each model hooks slightly differently. See [Build & extend → Agent CLIs](../build-extend/agent-clis.md).

## When to reach for a hook

- You want to log every outgoing message to your audit pipeline.
- You want to enforce a content policy on responses before they post.
- You need to enrich the LLM context with data from your own system, beyond what an MCP server can provide.
- You want custom metrics on top of [Tracing](../use/run-timeline.md).

If you only need the agent to *call* an external system on demand, an [MCP server](./mcp-servers.md) is the simpler choice.

## Related

- [Agents](./agents.md)
- [MCP servers](./mcp-servers.md)
- [Init scripts](./init-scripts.md)
- [Build & extend → Agent CLIs](../build-extend/agent-clis.md)
