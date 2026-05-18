---
title: Terraform Resources
description: Summary of key resources in terraform-provider-agyn.
order: 1
---

# Terraform Resources

The `agynio/terraform-provider-agyn` provider manages Agyn resources through the Gateway API.

Provider configuration requires an API URL:

```hcl
provider "agyn" {
  api_url = "https://gateway.example.com"
}
```

Important resources include:

| Resource | Purpose |
| --- | --- |
| `agyn_organization` | Creates an organization scope. |
| `agyn_llm_provider` | Stores provider endpoint, auth method, token, and protocol. |
| `agyn_model` | Maps a local model name to a provider remote model. |
| `agyn_agent` | Defines agent runtime, model, image, availability, and resources. |
| `agyn_mcp` | Defines an MCP tool sidecar for an agent. |
| `agyn_secret` and `agyn_secret_provider` | Store local secret values or remote provider references. |
| `agyn_runner` | Registers workload execution capacity. |

Generated provider docs live in the provider repository under `docs/resources`.
