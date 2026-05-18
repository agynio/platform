---
title: Models and Providers
description: Configure LLM providers and model aliases.
order: 1
---

# Models and Providers

The LLM service stores providers and model mappings.

The LLM Proxy exposes an OpenAI-compatible Responses API endpoint for agents, authenticates callers, resolves model IDs, and forwards requests to upstream providers.

A provider needs an endpoint, auth method, and token.

```hcl
resource "agyn_llm_provider" "openai" {
  organization_id = agyn_organization.example.id
  endpoint        = "https://api.openai.com/v1"
  auth_method     = "bearer"
  token           = var.openai_api_key
  protocol        = "responses"
}
```

A model maps a local name to a provider remote name:

```hcl
resource "agyn_model" "gpt4o" {
  organization_id = agyn_organization.example.id
  name            = "gpt-4o"
  llm_provider_id = agyn_llm_provider.openai.id
  remote_name     = "gpt-4o"
}
```
