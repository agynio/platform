---
title: Image pull secrets
description: Credentials for pulling container images from private registries.
order: 17
---

# Image pull secrets

If your agents use container images from a private registry (your company's GHCR, a private Docker Hub, ECR with auth, etc.), the runner needs credentials to pull them. Image pull secrets store those credentials and let you attach them to agents, MCP servers, and hooks.

## Two ways to specify the password

| Mode | Where the password lives |
|---|---|
| **Inline** | Stored in the platform database, encrypted at rest. Use for short-lived setups. |
| **Remote** | Resolved from a [secret provider](./secret-providers.md) (e.g. Vault) at workload start. Use for production. |

## Create an image pull secret

### In the Console

1. Console → **Image Pull Secrets** (`/organizations/<org>/image-pull-secrets`).
2. Click **New image pull secret**.
3. Set:
   - **Name** — display name.
   - **Registry** — registry hostname (e.g. `ghcr.io`, `123456789012.dkr.ecr.us-west-2.amazonaws.com`).
   - **Username** — registry username.
   - **Password storage** — **Inline** or **Remote provider**.
   - For inline: enter the password.
   - For remote: pick a provider and remote path.
4. Save.

![Image pull secret create form](../_assets/console/secrets/new-image-pull-secret.png)

### With Terraform

Inline:

```hcl
resource "agyn_image_pull_secret" "ghcr" {
  organization_id = agyn_organization.acme.id

  name     = "ghcr-private"
  registry = "ghcr.io"
  username = "agyn-ci"
  password = var.ghcr_token
}
```

Remote-backed:

```hcl
resource "agyn_image_pull_secret" "ghcr" {
  organization_id = agyn_organization.acme.id

  name     = "ghcr-private"
  registry = "ghcr.io"
  username = "agyn-ci"

  password_secret_id = agyn_secret.ghcr_token.id
}
```

## Attach to an agent, MCP, or hook

Image pull secrets only take effect once attached. Attach them on the resource that needs to pull a private image.

### In the Console

1. Console → **Agents → <agent>** → **Image pull secrets** tab (or the same tab on an MCP / hook).
2. Click **Attach image pull secret**.
3. Pick one or more image pull secrets.
4. Save.

![Agent image pull secrets tab](../_assets/console/agents/image-pull-secrets.png)

The runner uses every attached image pull secret when pulling that resource's image. The first credential that matches the image's registry succeeds; others are ignored.

### With Terraform

```hcl
resource "agyn_agent_image_pull_secret_attachment" "ghcr_on_support" {
  agent_id              = agyn_agent.support.id
  image_pull_secret_id  = agyn_image_pull_secret.ghcr.id
}
```

For an MCP or hook, specify `mcp_id` or `hook_id` instead.

## Edit and rotate

Inline secrets: edit the password in place. Remote-backed secrets rotate at the provider — the platform reads the latest password on the next workload start.

If a runner is mid-pull when you rotate, that pull keeps the old credentials. New pulls use the new value.

## What happens if the credential is wrong

The workload transitions to `failed` with `failure_reason = image_pull_failed`. The container's `reason` is `ImagePullBackOff` and `message` carries the registry's error. See [Monitoring](./monitoring.md#workloads) for the live view.

## Related

- [Secrets](./secrets.md)
- [Secret providers](./secret-providers.md)
- [Agents](./agents.md)
- [Troubleshooting → Image pulls](../troubleshooting/install.md#image-pull-failures)
