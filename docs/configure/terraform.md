---
title: Terraform Automation
description: Use Terraform as an automation option for Agyn resources.
order: 6
---

# Terraform Automation

Terraform is optional, but it is the best path for repeatable setup.

The provider talks to the Gateway API.

## Steps

1. Configure the provider with the Gateway URL.
2. Manage organizations, providers, models, agents, MCPs, secrets, and runners in code.
3. Store sensitive inputs in Terraform variables or your normal secret workflow.
4. Apply small changes and verify the Console reflects them.

## Provider block

```hcl
provider "agyn" {
  api_url = "https://gateway.example.com"
}
```

## Expected outcome

Teams can review and version platform configuration changes instead of relying only on manual Console edits.
