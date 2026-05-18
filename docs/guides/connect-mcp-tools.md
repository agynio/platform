---
title: Connect MCP Tools
description: Add an MCP sidecar to an existing agent.
order: 1
---

# Connect MCP Tools

MCPs are sidecar tool servers that belong to an agent.

The Terraform resource requires `agent_id`, `name`, `image`, and `command`.

```hcl
resource "agyn_mcp" "filesystem" {
  agent_id = agyn_agent.support.id
  name     = "filesystem"
  image    = "ghcr.io/agynio/mcp-server:v1.0.0"
  command  = "mcp-server --port 8080"
}
```

Use a short, lowercase name because it becomes the server key in agent tool configuration.

Attach environment variables, volumes, init scripts, or image pull secrets as separate resources when the sidecar needs them.

Read [Tools, MCPs, and Secrets](../configure/tools-mcp-and-secrets.md) before adding production credentials.
