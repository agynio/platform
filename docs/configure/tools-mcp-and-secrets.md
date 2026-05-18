---
title: Tools, MCPs, and Secrets
description: Attach tool sidecars and resolve secret values safely.
order: 3
---

# Tools, MCPs, and Secrets

MCP resources define tool servers that run alongside an agent workload.

The platform treats MCPs as agent sub-resources with their own image, command, and compute resources.

```hcl
resource "agyn_mcp" "filesystem" {
  agent_id = agyn_agent.example.id
  name     = "filesystem"
  image    = "ghcr.io/agynio/mcp-server:v1.0.0"
  command  = "mcp-server --port 8080"
}
```

Secrets can be stored directly or referenced from a provider such as Vault.

```hcl
resource "agyn_secret" "remote" {
  organization_id      = agyn_organization.example.id
  name                 = "zendesk-token"
  provider_id          = agyn_secret_provider.vault.id
  provider_secret_name = "secret/platform/zendesk/api_token"
}
```

Keep credentials in secrets, not prompts or model context.
