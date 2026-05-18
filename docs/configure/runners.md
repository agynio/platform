---
title: Runners
description: Register capacity for executing agent workloads.
order: 5
---

# Runners

Runners execute agent workloads.

The default Kubernetes runner is installed by the quick bootstrap path and by the `agyn-apps` Helm chart.

## Steps

1. Register a runner for the cluster or organization.
2. Store the returned service token securely.
3. Deploy the runner workload with labels and capabilities that match your environment.
4. Confirm the runner appears healthy before starting agents.
5. Add capabilities only when the runtime can actually satisfy them.

## Minimal Terraform shape

```hcl
resource "agyn_runner" "default" {
  name = "default-k8s-runner"
  labels = { region = "us-east-1" }
}
```

## Expected outcome

The Agents Orchestrator can route work to a registered runner that advertises the capabilities required by the agent.
