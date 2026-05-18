---
title: Terraform
description: Provision Agyn agents with infrastructure as code.
order: 2
---

# Terraform

Terraform lets teams review and version agent infrastructure changes.

Use it when agent configuration should move through normal change control.

## Example shape

```hcl
resource "agyn_agent" "support" {
  name           = "support-agent"
  model          = "gpt-4o"
  sandbox_image  = "agyn/sandbox:latest"
  idle_timeout   = "10m"
  mcp            = ["filesystem", "zendesk"]
}
```

For field descriptions, see [Configuration](./configuration.md).
