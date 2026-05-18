---
title: Terraform
description: Manage organizations, agents, models, secrets, runners, and apps as code.
order: 23
---

# Terraform

Everything you can do in the Console you can also do with the [`agynio/terraform-provider-agyn`](https://github.com/agynio/terraform-provider-agyn) Terraform provider. This page is the admin entry point — for the developer's full reference, see [Build & extend → Terraform provider](../build-extend/terraform-provider.md).

## When Terraform helps

- You manage multiple organizations, environments, or clusters and want consistent configuration across them.
- You want changes to agent configuration to be reviewable as PRs.
- You want repeatable bootstrap — bringing up a new org for a team takes minutes, not hours.
- You want resource lifetimes outside the Console — for example, agents that come and go with CI.

If you administer a single small organization, the Console alone is fine.

## Set up the provider

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

Use an [API token](../use/api-tokens.md) for the user or service identity that should own the changes. Cluster admin tokens can manage cluster-scoped resources; org owner tokens can manage their organizations.

## Minimal organization bootstrap

```hcl
resource "agyn_organization" "acme" {
  name = "Acme"
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

resource "agyn_agent" "support" {
  organization_id = agyn_organization.acme.id

  name        = "Support"
  nickname    = "support"
  description = "Front-line customer support."

  model      = agyn_llm_model.gpt_4o.name
  image      = "ghcr.io/agynio/agent-runtime:v1.0.0"
  init_image = "ghcr.io/agynio/agent-init-codex:v1.0.0"

  idle_timeout = "5m"
  availability = "internal"
}
```

`terraform apply` against this configuration leaves you with a working organization, a configured LLM, and one agent.

## How drift works

Terraform shows you a diff between your `.tf` files and the platform's state on every plan:

- If someone edits a Terraform-managed resource in the Console, the next `terraform plan` shows the drift. Apply re-asserts your declared values.
- If you delete a `.tf` block, `terraform plan` proposes to delete the resource on the next apply.
- If you import an existing Console resource into Terraform (`terraform import`), Terraform takes ownership and starts tracking it.

For high-mutation resources (e.g. agent ENVs that change daily), consider managing them only in the Console and excluding them from Terraform — otherwise you fight drift constantly.

## Common patterns

### Per-environment agents from one module

```hcl
module "support_agent" {
  for_each = toset(["dev", "staging", "prod"])
  source   = "./modules/support-agent"

  organization_id = agyn_organization.acme[each.key].id
  model           = "gpt-4o"
  image           = "ghcr.io/agynio/agent-runtime:${each.key == "prod" ? "v1.0.0" : "main"}"
}
```

### Splitting sensitive values

Move secrets to a separate `.tfvars` file kept out of source control, or use Terraform's external secret data sources:

```hcl
data "vault_generic_secret" "openai" {
  path = "kv/data/agyn/openai"
}

resource "agyn_secret" "openai_key" {
  organization_id = agyn_organization.acme.id
  name            = "openai-api-key"
  value           = data.vault_generic_secret.openai.data["value"]
}
```

### State backends

Use a remote state backend (S3 + DynamoDB, GCS, Terraform Cloud) for any non-trivial deployment. State contains sensitive output values (service tokens, in-memory secrets) — protect it accordingly.

## What to manage in Terraform vs. the Console

| Resource | Recommended owner |
|---|---|
| Organizations | Terraform |
| LLM providers and models | Terraform |
| Secret providers | Terraform |
| Long-lived secrets | Terraform (sourced from Vault) |
| Agents (production) | Terraform |
| Agent sub-resources (MCPs, hooks, skills) | Terraform |
| Runners | Terraform |
| Apps installations | Terraform |
| Members | Either — owner-only roles tend to live in Terraform; member invites in the Console |
| Per-agent roles | Either |
| Personal API tokens | Console (per user) |
| Devices | Console (per user) |

## Related

- [Build & extend → Terraform provider](../build-extend/terraform-provider.md) — full resource reference.
- [Console overview](./console-overview.md) — the UI equivalent.
- [Use → API tokens](../use/api-tokens.md) — how to authenticate the provider.
