---
title: API tokens
description: Long-lived credentials for programmatic access.
order: 11
---

# API tokens

An API token is a long-lived credential you can use to call the platform from CI, scripts, or Terraform. Tokens resolve to your user identity — anything you can do in the Console, your token can do via the Gateway API.

Format: `agyn_<44 characters>` (256 bits of entropy, base62-encoded). The `agyn_` prefix exists so secret-scanning tools (GitHub, GitLab, etc.) can detect leaked tokens.

## Create a token

### In the Console

1. Click your avatar → **API tokens** (`/api-tokens`).
2. Click **New token**.
3. Set:
   - **Description** — what the token is for (e.g. `prod terraform`, `ci`).
   - **Expiration** — optional. Without it, the token is long-lived.
4. Save. The Console shows the token **once**. Copy it now — it cannot be retrieved later.

![API tokens page with new token dialog](../_assets/console/api-tokens/new-token.png)

Tokens are stored hashed on the platform — only the prefix and metadata are visible after creation.

## Use a token

```sh
export AGYN_TOKEN="agyn_..."
curl -H "Authorization: Bearer $AGYN_TOKEN" \
  https://gateway.agyn.example.com/api/agynio.api.users.v1.UsersGateway/GetMe \
  -X POST -d '{}' -H 'Content-Type: application/json'
```

For Terraform:

```hcl
provider "agyn" {
  gateway = "https://gateway.agyn.example.com"
  token   = var.agyn_api_token
}
```

For the [`agyn` CLI](../build-extend/agyn-cli.md):

```sh
agyn login --gateway https://gateway.agyn.example.com --token "$AGYN_TOKEN"
```

## Authorization

Tokens grant exactly your authorization — no more, no less. A token belonging to an org owner can manage that organization; a token belonging to a non-owner cannot.

This is important: if you need a token with cluster admin capabilities, create it under a cluster admin user. Token scopes are not narrowed independently from the user.

## See and revoke tokens

The API tokens page lists every token on your account:

| Column | Notes |
|---|---|
| **Description** | What you set at creation. |
| **Created** | When you made it. |
| **Last used** | The most recent time the token authenticated a request. |
| **Expires** | Expiration time, if set. |

To **revoke** a token, click the kebab menu → **Revoke**. The token stops authenticating immediately. Anything using it (CI, Terraform) will fail until you rotate.

## Best practices

- **Use a descriptive name.** `prod-terraform` is better than `mine`. Future-you will thank you.
- **One token per use case.** Separate tokens for CI, Terraform, scripts. Revoking one doesn't take down the others.
- **Treat tokens like passwords.** Never commit them. Use your CI secret manager or a vault.
- **Rotate periodically** for any long-lived deployment. Set an expiration if you have a rotation cadence.
- **Use a separate service account** for unattended automation, so a person leaving doesn't take their tokens (and the things those tokens drive) with them. Today this means: create a non-human user in your IdP, give it organization roles, and generate tokens under it.

## Recover from a leak

If you suspect a token leaked:

1. Revoke it from the API tokens page immediately.
2. Audit recent activity for the user in [Administer → Monitoring → Threads](../administer/monitoring.md) and the relevant Tracing app views.
3. Rotate any credentials the leaked token could have accessed.

## Related

- [Build & extend → Gateway API](../build-extend/gateway-api.md) — what tokens unlock.
- [Build & extend → Terraform provider](../build-extend/terraform-provider.md) — main consumer of API tokens.
- [Build & extend → agyn CLI](../build-extend/agyn-cli.md) — interactive use.
