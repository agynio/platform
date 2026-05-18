---
title: Secrets
description: Configure local and external secret references for agents and tools.
order: 4
---

# Secrets

Secrets keep credentials out of prompts and model context.

Agyn supports direct secret values and provider-backed references such as Vault paths.

## Steps

1. Decide whether the value should be stored directly or resolved from an external provider.
2. Create a secret provider if using Vault or another external source.
3. Create an `agyn_secret` that names the value or provider path.
4. Attach the secret to an agent, MCP, or hook environment through the appropriate resource.
5. Rotate values in the provider instead of editing prompts or agent instructions.

## Minimal Terraform shape

```hcl
resource "agyn_secret" "zendesk" {
  organization_id = agyn_organization.example.id
  name            = "zendesk-token"
  value           = var.zendesk_token
}
```

## Expected outcome

Agents and tool sidecars receive required credentials at runtime without exposing them to the model as plain instructions.
