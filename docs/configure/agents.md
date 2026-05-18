---
title: Agents
description: Configure agent runtime, availability, and workload behavior.
order: 2
---

# Agents

An agent resource defines desired state.

It includes the model name, runtime image, init image, role, availability, idle timeout, resource limits, and optional JSON configuration.

## Steps

1. Choose a model from the organization model registry.
2. Choose the dev container image the agent should run.
3. Choose the init image for the agent CLI type.
4. Set `availability` to `internal` or `private`.
5. Set an idle timeout that matches the expected work pattern.
6. Attach MCP tools, secrets, volumes, or hooks only when needed.

## Minimal Terraform shape

```hcl
resource "agyn_agent" "support" {
  organization_id = agyn_organization.example.id
  name            = "support-agent"
  role            = "assistant"
  model           = "gpt-4o"
  image           = "ghcr.io/agynio/agent-runtime:v1.0.0"
  init_image      = "ghcr.io/agynio/agent-init-codex:v1.0.0"
  availability    = "private"
}
```
