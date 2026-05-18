---
title: Terraform provider reference
description: Pointer to the full provider documentation.
order: 4
---

# Terraform provider reference

The [`agynio/terraform-provider-agyn`](https://github.com/agynio/terraform-provider-agyn) provider exposes every Gateway resource as a Terraform resource or data source. This page is a pointer to its full reference; for the user-facing introduction, see [Administer → Terraform](../administer/terraform.md) and [Build & extend → Terraform provider](../build-extend/terraform-provider.md).

## Where the docs live

The full provider reference is generated from the provider's source and published on the Terraform Registry once each release ships:

- **Registry:** `registry.terraform.io/providers/agynio/agyn`
- **GitHub:** [agynio/terraform-provider-agyn](https://github.com/agynio/terraform-provider-agyn)

Each resource page on the Registry includes:

- Argument reference (every field, type, required/optional, in-place vs. force-new).
- Attribute reference (computed outputs).
- Import syntax.
- Example usage.

## Resource list at a glance

| Resource | Service backing it |
|---|---|
| `agyn_organization` | Organizations |
| `agyn_organization_member` | Organizations |
| `agyn_cluster_admin` | Authorization (tuple write) |
| `agyn_agent` | Agents |
| `agyn_agent_role` | Authorization (tuple write) |
| `agyn_agent_mcp` | Agents |
| `agyn_agent_skill` | Agents |
| `agyn_agent_hook` | Agents |
| `agyn_agent_env` | Agents |
| `agyn_agent_init_script` | Agents |
| `agyn_agent_volume_attachment` | Agents |
| `agyn_agent_image_pull_secret_attachment` | Agents |
| `agyn_volume` | Agents |
| `agyn_image_pull_secret` | Secrets |
| `agyn_llm_provider` | LLM |
| `agyn_llm_model` | LLM |
| `agyn_secret_provider` | Secrets |
| `agyn_secret` | Secrets |
| `agyn_runner` | Runners |
| `agyn_app` | Apps |
| `agyn_app_installation` | Apps |

## Data sources

| Data source | Purpose |
|---|---|
| `agyn_user` | Look up a user by username or OIDC subject. |
| `agyn_agent` | Look up an agent by name. |
| `agyn_app` | Look up a published app by slug. |
| `agyn_organization` | Look up an organization by name. |
| `agyn_runner` | Look up a registered runner. |

## Provider configuration

```hcl
provider "agyn" {
  gateway = "https://gateway.agyn.example.com"
  token   = var.agyn_api_token
}
```

| Argument | Description |
|---|---|
| `gateway` | Gateway endpoint URL. |
| `token` | API token (or `AGYN_TOKEN` env var). |
| `insecure_skip_verify` | Skip TLS verification — dev only. |

## Versioning

The provider follows semantic versioning. The platform chart's release notes call out the minimum compatible provider version. Pin in your config:

```hcl
terraform {
  required_providers {
    agyn = {
      source  = "agynio/agyn"
      version = "~> 1.0"
    }
  }
}
```

## Related

- [Administer → Terraform](../administer/terraform.md) — getting started.
- [Build & extend → Terraform provider](../build-extend/terraform-provider.md) — developer details.
- [Use → API tokens](../use/api-tokens.md) — credentials for `var.agyn_api_token`.
