---
title: Configure a Private Model Provider
description: Register an LLM endpoint and expose a model name to agents.
order: 2
---

# Configure a Private Model Provider

Use an `agyn_llm_provider` for the upstream endpoint and an `agyn_model` for the name agents use.

```hcl
resource "agyn_llm_provider" "private" {
  organization_id = agyn_organization.example.id
  endpoint        = "https://models.example.com/v1"
  auth_method     = "bearer"
  token           = var.model_api_token
  protocol        = "responses"
}

resource "agyn_model" "frontier" {
  organization_id = agyn_organization.example.id
  name            = "frontier"
  llm_provider_id = agyn_llm_provider.private.id
  remote_name     = "provider/frontier-prod"
}
```

Set `agyn_agent.model` to `agyn_model.frontier.name`.

The LLM Proxy resolves that name at runtime before forwarding requests.
