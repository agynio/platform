---
title: LLM Providers and Models
description: Configure model provider endpoints and model names.
order: 3
---

# LLM Providers and Models

The LLM service stores provider credentials and model mappings.

The LLM Proxy exposes the OpenAI-compatible endpoint agents call at runtime.

## Steps

1. Create an LLM provider with endpoint, auth method, token, and protocol.
2. Create a model mapping with the name agents should use.
3. Point agents at the model name, not directly at the upstream provider.
4. Verify model calls through an agent run before broad rollout.

## Minimal Terraform shape

```hcl
resource "agyn_llm_provider" "openai" {
  organization_id = agyn_organization.example.id
  endpoint        = "https://api.openai.com/v1"
  auth_method     = "bearer"
  token           = var.openai_api_key
  protocol        = "responses"
}
```

## Expected outcome

Agents can reference stable model names while operators retain control over provider endpoint, token, protocol, and remote model name.
