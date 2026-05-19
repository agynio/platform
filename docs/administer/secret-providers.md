---
title: Secret providers
description: Connect an external secret store like HashiCorp Vault.
order: 15
---

# Secret providers

A secret provider tells the platform how to resolve a remote secret reference at runtime. You register a provider once; then individual [secrets](./secrets.md) can either store a value locally (encrypted in the platform database) or reference a path in an external store.

Today, the platform supports:

| Type | What it is |
|---|---|
| `vault` | HashiCorp Vault KV v2 |

More providers will be added over time. If a provider is not listed, store the value locally.

## When to use an external provider

- Your organization already uses Vault (or another secret store) and wants Agyn to read from there rather than duplicate the value.
- You need values to rotate automatically — the platform resolves them on every workload start.
- You want a single audit trail across all systems consuming a credential.

If none of those apply, just store the value locally — it is encrypted at rest with a Kubernetes Secret key.

## Register a Vault provider

### In the Console

1. Console → **Secret Providers** (`/organizations/<org>/secret-providers`).
2. Click **New provider**.
3. Set:
   - **Name** — display name (e.g. `vault-prod`).
   - **Type** — `vault`.
   - **Address** — Vault URL (e.g. `https://vault.internal.acme.example:8200`).
   - **Token** — a Vault token with read access to the paths you will reference. Masked after save.
4. Save.


### With Terraform

```hcl
resource "agyn_secret_provider" "vault_prod" {
  organization_id = agyn_organization.acme.id

  name = "vault-prod"
  type = "vault"

  config = {
    address = "https://vault.internal.acme.example:8200"
    token   = var.vault_token
  }
}
```

`config.token` is a sensitive Terraform value. Source it from your CI/Terraform secret manager.

## What secrets resolve to

When an agent's [ENV references a Vault-backed secret](./environment-variables.md#add-a-secret-backed-env), the Secrets service:

1. Looks up the secret's `remote_path` (e.g. `kv/data/prod/stripe-api-key`).
2. Calls Vault with the provider's address and token.
3. Reads the value at that path.
4. Returns it to the orchestrator, which injects it as an ENV into the container.

The platform does not cache resolved values beyond the workload's lifetime. Workload restart forces a fresh resolution.

## Rotate the provider's token

When the Vault token used by the provider needs rotation:

### In the Console

1. Secret Providers → click the provider row.
2. Click **Edit token**.
3. Paste the new token. Save.

The new token is used for all subsequent secret resolutions. Workloads currently running continue with whatever ENV values they already have until restart.

### With Terraform

Update the `config.token` value and apply. Terraform issues `UpdateSecretProvider`.

## Edit and delete

Editing a provider is in-place. Deleting a provider invalidates every secret that references it — referencing secrets fail to resolve, and any ENV depending on them blocks the workload from starting.

## Authorization

Vault paths the provider can read are determined by the Vault token's policy. Set the policy in Vault to limit which paths Agyn can resolve. The platform never auto-discovers paths — every secret reference is explicitly configured.

## Related

- [Secrets](./secrets.md) — create a remote-referenced secret.
- [Environment variables](./environment-variables.md) — pass a secret to a container.
- [Operate → Security](../operate/security.md)
