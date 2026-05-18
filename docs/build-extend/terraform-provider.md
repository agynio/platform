---
title: Terraform provider
description: Manage Agyn resources as code.
order: 2
---

# Terraform provider

The [`agynio/terraform-provider-agyn`](https://github.com/agynio/terraform-provider-agyn) provider wraps the [Gateway API](./gateway-api.md) as Terraform resources and data sources. Use it to declare organizations, agents, models, secrets, runners, and apps in `.tf` files.

For the user-facing introduction, see [Administer → Terraform](../administer/terraform.md). This page is the developer reference.

## Provider configuration

```hcl
terraform {
  required_providers {
    agyn = {
      source  = "agynio/agyn"
      version = "~> 1.0"
    }
  }
}

provider "agyn" {
  gateway = "https://gateway.agyn.example.com"
  token   = var.agyn_api_token
}
```

| Argument | Description |
|---|---|
| `gateway` | Gateway endpoint URL (e.g. `https://gateway.agyn.example.com`). Required. |
| `token` | API token. Use the `AGYN_TOKEN` env var instead in CI. Required. |
| `insecure_skip_verify` | Skip TLS verification. Local development only. |

## Resources

| Resource | What it manages |
|---|---|
| `agyn_organization` | Organization. |
| `agyn_organization_member` | Membership in an organization. |
| `agyn_cluster_admin` | Cluster admin tuple (cluster admin only). |
| `agyn_agent` | Agent. |
| `agyn_agent_role` | Per-agent role assignment. |
| `agyn_agent_mcp` | MCP server attached to an agent. |
| `agyn_agent_skill` | Skill on an agent. |
| `agyn_agent_hook` | Hook on an agent. |
| `agyn_agent_env` | Environment variable on an agent / MCP / hook. |
| `agyn_agent_init_script` | Init script on an agent / MCP / hook. |
| `agyn_volume` | Volume definition. |
| `agyn_agent_volume_attachment` | Attaches a volume to an agent / MCP / hook. |
| `agyn_image_pull_secret` | Image pull secret. |
| `agyn_agent_image_pull_secret_attachment` | Attaches an image pull secret to an agent / MCP / hook. |
| `agyn_llm_provider` | LLM provider. |
| `agyn_llm_model` | LLM model mapping. |
| `agyn_secret_provider` | External secret store (Vault, etc.). |
| `agyn_secret` | Secret value (local or remote reference). |
| `agyn_runner` | Runner registration. |
| `agyn_app` | App publication. |
| `agyn_app_installation` | App installation in an organization. |

## Data sources

| Data source | Description |
|---|---|
| `agyn_user` | Look up a user by username or OIDC subject. Returns `identity_id`. |
| `agyn_agent` | Look up an agent by name. |
| `agyn_app` | Look up a published app by slug. |
| `agyn_organization` | Look up an organization by name. |
| `agyn_runner` | Look up a registered runner. |

## End-to-end example

```hcl
resource "agyn_organization" "acme" {
  name = "Acme"
}

resource "agyn_organization_member" "alice" {
  organization_id = agyn_organization.acme.id
  username        = "alice"
  role            = "owner"
}

resource "agyn_secret" "openai_key" {
  organization_id = agyn_organization.acme.id
  name            = "openai-api-key"
  value           = var.openai_api_key
}

resource "agyn_llm_provider" "openai" {
  organization_id = agyn_organization.acme.id

  name        = "openai-prod"
  endpoint    = "https://api.openai.com/v1"
  protocol    = "responses"
  auth_method = "bearer"

  token_secret_id = agyn_secret.openai_key.id
}

resource "agyn_llm_model" "gpt_4o" {
  organization_id   = agyn_organization.acme.id
  provider_id       = agyn_llm_provider.openai.id

  name              = "gpt-4o"
  remote_model_name = "gpt-4o-2024-08-06"
}

resource "agyn_runner" "acme_runner" {
  organization_id = agyn_organization.acme.id
  name            = "acme-runner"
  labels          = { region = "us-east-1" }
  capabilities    = ["docker"]
}

resource "agyn_agent" "support" {
  organization_id = agyn_organization.acme.id

  name        = "Support Agent"
  nickname    = "support"
  description = "Front-line support."

  model      = agyn_llm_model.gpt_4o.name
  image      = "ghcr.io/agynio/agent-runtime:v1.0.0"
  init_image = "ghcr.io/agynio/agent-init-codex:v1.0.0"

  idle_timeout = "5m"
  availability = "internal"

  runner_labels = { region = "us-east-1" }
}

resource "agyn_agent_mcp" "files" {
  agent_id = agyn_agent.support.id
  name     = "files"
  image    = "ghcr.io/agynio/files-mcp:latest"
}

resource "agyn_agent_skill" "tone_guide" {
  agent_id = agyn_agent.support.id
  name     = "tone-guide"
  body     = file("${path.module}/skills/tone-guide.md")
}
```

`terraform apply` produces a working agent reachable from chat.

## State and sensitive values

- `agyn_secret`'s `value` is stored in Terraform state. Use a remote state backend with encryption.
- `agyn_runner`'s `service_token` is a sensitive output. Pipe it to a Secret on the runner cluster — do not commit it.
- `agyn_app`'s `service_token` is the same.

Treat the Terraform state as production secret material.

## Imports

To bring an existing Console-created resource under Terraform:

```sh
terraform import agyn_agent.support <agent_id>
```

After import, write the matching `.tf` block and run `terraform plan` to see any drift. Most resources support import; secrets do not (the value is not retrievable).

## CI workflow

```yaml
- run: terraform init
- run: terraform plan -out plan
  env:
    AGYN_TOKEN: ${{ secrets.AGYN_TOKEN }}
- run: terraform apply plan
  if: github.ref == 'refs/heads/main'
```

Use a dedicated CI token (one per environment) with org owner scope on the target organization. Grant cluster admin only when managing cluster-scoped resources.

## Related

- [Administer → Terraform](../administer/terraform.md) — the user-facing introduction.
- [Gateway API](./gateway-api.md) — what the provider calls under the hood.
- [Use → API tokens](../use/api-tokens.md) — for `var.agyn_api_token`.
