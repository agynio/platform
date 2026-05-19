---
title: MCP servers
description: Give agents tools via Model Context Protocol.
order: 7
---

# MCP servers

MCP servers expose tools to agents. They run as sidecar containers in the agent's pod and share the pod network — the agent CLI talks to them over localhost. Each MCP server typically wraps one external system (a database, an API, a SaaS product, a local toolset).

## When to add an MCP

Add an MCP server when you want the agent to do something the LLM cannot do alone:

- Read or write your databases.
- Call internal APIs.
- Execute code on disk.
- Read files uploaded into the conversation (the platform's [files-mcp](../build-extend/files-mcp.md) is pre-built for this).
- Search a vector store, query a knowledge base, browse the web.

## Configure an MCP server on an agent

### In the Console

1. Console → **Agents → <agent>** → **MCPs** tab.
2. Click **Add MCP**.
3. Fill in:
   - **Name** — identifier within the agent. Tools from this MCP are namespaced under this name in the agent's tool list.
   - **Image** — container image of the MCP server.
   - **Command** — optional entrypoint override.
   - **Args** — command arguments.
   - **Compute** — CPU/memory requests and limits.
   - **Environment variables** — both plain values and references to [secrets](./secrets.md).
   - **Init scripts** — shell scripts run before the MCP server starts.
   - **Image pull secrets** — credentials for private registries.
4. Save. The MCP is added to the agent's spec. The next workload includes it as a sidecar.


The agent CLI is notified of the new MCP on its next startup. Workloads already running with the old config keep the old MCP set until they restart.

### With Terraform

```hcl
resource "agyn_agent_mcp" "postgres" {
  agent_id = agyn_agent.support.id

  name    = "postgres"
  image   = "ghcr.io/agynio/mcp-postgres:latest"
  command = ["mcp-postgres"]

  compute = {
    cpu_limit    = "500m"
    memory_limit = "256Mi"
  }

  envs = [
    {
      name      = "POSTGRES_URL"
      secret_id = agyn_secret.postgres_url.id
    },
  ]
}
```

## How tool discovery works

When `agynd` boots the agent CLI, it:

1. Fetches the agent's MCP list from the Agents service.
2. Configures the agent CLI's MCP endpoints — pointing at the MCP sidecars' localhost ports.
3. Starts the agent CLI.

The agent CLI then performs MCP's standard tool discovery and registers each tool under the MCP's name.

## Streamable HTTP and stdio

Most modern MCP servers speak **Streamable HTTP**. Agyn supports both transports:

- **Streamable HTTP MCPs** run as-is — exposed on a port inside the pod.
- **stdio MCPs** are wrapped by a small sidecar proxy that adapts the stdio process to Streamable HTTP. You do not need to do anything special — the platform handles the adaptation if your MCP only speaks stdio.

## Built-in MCPs

The platform ships a few MCP servers you can attach to any agent:

| Image | What it does |
|---|---|
| `ghcr.io/agynio/files-mcp:<version>` | `read_file(file_id)` — lets the agent read files uploaded into the conversation. |
| (more to come) | |

If you build your own MCP server, see [Build & extend → MCP servers](../build-extend/mcp-servers.md).

## Permissions and secrets

MCP servers run with the agent's identity for the purposes of platform calls (e.g. files-mcp calls Gateway as the agent). For external systems, give the MCP its own credentials via [environment variables](./environment-variables.md) backed by [secrets](./secrets.md).

## Edit and delete

MCPs are edited and deleted just like other agent sub-resources — through the same tab. Removing an MCP from an agent's spec stops including that sidecar on the next workload start.

## Related

- [Agents](./agents.md)
- [Environment variables](./environment-variables.md)
- [Secrets](./secrets.md)
- [Build & extend → MCP servers](../build-extend/mcp-servers.md) — write your own.
- [Build & extend → files-mcp](../build-extend/files-mcp.md) — the file-reading built-in.
