---
title: Runners
description: Register workload executors and route agents to runtime capacity.
order: 4
---

# Runners

Runners execute agent workloads.

The Runners service stores runner registrations, labels, capabilities, identity IDs, service tokens, and workload state.

```hcl
resource "agyn_runner" "example" {
  name            = "example-runner"
  organization_id = agyn_organization.example.id
  labels = {
    region = "us-east-1"
  }
}
```

`service_token` is returned as a sensitive value and is used by the runner deployment.

The default Kubernetes runner is deployed by the apps stack in `agynio/bootstrap` and by the `agyn-apps` Helm chart.

Capabilities let orchestrators route workloads only to runners that can satisfy the agent request.
