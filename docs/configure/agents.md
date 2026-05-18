---
title: Agents
description: Configure agent runtime, availability, resources, and behavior.
order: 2
---

# Agents

An agent is the deployable unit users interact with.

The Agents service stores desired state; orchestrators and runners reconcile runtime state from it.

Important fields include `organization_id`, `name`, `nickname`, `role`, `model`, `image`, `init_image`, `availability`, `idle_timeout`, `resources`, and optional JSON `configuration`.

```hcl
resource "agyn_agent" "example" {
  organization_id = agyn_organization.example.id
  name            = "example-agent"
  nickname        = "example-agent"
  role            = "assistant"
  model           = "gpt-4o"
  image           = "ghcr.io/agynio/agent-runtime:v1.0.0"
  init_image      = "ghcr.io/agynio/agent-init:v1.0.0"
  availability    = "private"
  idle_timeout    = "10m"
}
```

Set `availability = "internal"` for organization-wide access or `private` for role-gated access.
