---
title: Secrets
description: Store credentials locally or by reference, and inject them into containers.
order: 16
---

# Secrets

A secret holds a credential value. Two storage modes:

- **Local secret** — value stored in the platform database, encrypted at rest with a Kubernetes Secret key. Use this when you don't have an external secret store.
- **Remote secret** — value stored in a [secret provider](./secret-providers.md) (e.g. Vault) and resolved at workload start.

Either kind can be referenced from an [agent ENV](./environment-variables.md), an [MCP server ENV](./mcp-servers.md), a [hook ENV](./hooks.md), or an [LLM provider's credentials](./llm-providers.md).

## Create a local secret

### In the Console

1. Console → **Secrets** (`/organizations/<org>/secrets`).
2. Click **New secret**.
3. Set:
   - **Name** — display name (e.g. `stripe-api-key`).
   - **Storage** — **Local**.
   - **Value** — the secret value. Masked after save.
4. Save.

![Secrets tab with new secret dialog](../_assets/console/secrets/new-secret.png)

### With Terraform

```hcl
resource "agyn_secret" "stripe_api_key" {
  organization_id = agyn_organization.acme.id

  name  = "stripe-api-key"
  value = var.stripe_api_key
}
```

Source the value from your Terraform variables / CI secret manager. The value is encrypted server-side once written.

## Create a remote secret

### In the Console

1. Secrets → **New secret**.
2. Set:
   - **Name** — display name.
   - **Storage** — **Remote**.
   - **Provider** — pick a [registered provider](./secret-providers.md).
   - **Remote path** — provider-specific identifier (e.g. for Vault KV v2: `kv/data/prod/stripe-api-key`, key `value`).
3. Save.

![Remote secret reference](../_assets/console/secrets/new-remote-secret.png)

The platform never stores the value itself — it stores only the reference, and resolves the value each time a workload starts.

### With Terraform

```hcl
resource "agyn_secret" "stripe_api_key" {
  organization_id = agyn_organization.acme.id

  name        = "stripe-api-key"
  provider_id = agyn_secret_provider.vault_prod.id
  remote_path = "kv/data/prod/stripe-api-key"
  remote_key  = "value"
}
```

## Use a secret

Secrets are useful only when referenced. The main consumers:

- **ENVs** on agents, MCP servers, or hooks. See [Environment variables](./environment-variables.md).
- **LLM provider credentials**. See [LLM providers](./llm-providers.md).
- **Image pull secrets** when the underlying password lives in a provider. See [Image pull secrets](./image-pull-secrets.md).

## Rotate a secret

Local secrets:

- Console → secret → **Edit** → paste new value → **Save**.
- Terraform: update `value`, apply.

Remote secrets rotate in the provider — the platform reads the latest value on every workload start. No platform-side action needed unless you change the path.

Workloads already running keep their injected value until restart. Stop the workload in [Activity → Workloads](./monitoring.md) for an immediate rotation.

## Delete a secret

Deleting a secret breaks any ENV, LLM provider, or image pull secret that references it. The Console lists references before allowing the delete.

## Authorization

- Reading a secret's metadata (name, storage, provider, path) requires `member` on the organization.
- Reading the actual value is only ever done by the orchestrator and LLM Proxy at runtime — no user-facing endpoint returns plaintext.
- Writing or deleting a secret requires `owner` on the organization.

## Related

- [Secret providers](./secret-providers.md)
- [Environment variables](./environment-variables.md)
- [Image pull secrets](./image-pull-secrets.md)
- [LLM providers](./llm-providers.md)
