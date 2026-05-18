---
title: Deploy Your First Agent
description: Define an organization, model provider, model, and agent with Terraform.
order: 3
---

# Deploy Your First Agent

The Terraform provider talks to the Agyn Gateway API.

Start with provider configuration:

```hcl
provider "agyn" {
  api_url = "https://gateway.agyn.dev:2496"
}
```

Create an organization, provider, model, and agent:

```hcl
resource "agyn_organization" "example" { name = "example-org" }

resource "agyn_llm_provider" "openai" {
  organization_id = agyn_organization.example.id
  endpoint        = "https://api.openai.com/v1"
  auth_method     = "bearer"
  token           = var.openai_api_key
}

resource "agyn_model" "gpt4o" {
  organization_id = agyn_organization.example.id
  name            = "gpt-4o"
  llm_provider_id = agyn_llm_provider.openai.id
  remote_name     = "gpt-4o"
}

resource "agyn_agent" "support" {
  organization_id = agyn_organization.example.id
  name            = "support-agent"
  nickname        = "support"
  role            = "assistant"
  model           = agyn_model.gpt4o.name
  image           = "ghcr.io/agynio/agent-runtime:v1.0.0"
  init_image      = "ghcr.io/agynio/agent-init:v1.0.0"
  availability    = "private"
  idle_timeout    = "10m"
}
```

Add tools next with [Connect MCP tools](../guides/connect-mcp-tools.md).
