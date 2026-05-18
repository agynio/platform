---
title: Create a Vault-backed Secret
description: Reference a secret value from Vault instead of storing it directly.
order: 4
---

# Create a Vault-backed Secret

Use a secret provider when the value should remain in an external system.

```hcl
resource "agyn_secret_provider" "vault" {
  organization_id = agyn_organization.example.id
  name            = "vault"
  type            = "vault"
  vault = {
    address = "https://vault.example.com"
    token   = var.vault_token
  }
}

resource "agyn_secret" "zendesk" {
  organization_id      = agyn_organization.example.id
  name                 = "zendesk-token"
  provider_id          = agyn_secret_provider.vault.id
  provider_secret_name = "secret/platform/zendesk/api_token"
}
```

The provider secret name format is `<mount>/<path>/<key>`.

Attach resolved values to agent, MCP, or hook environment through ENV resources.
