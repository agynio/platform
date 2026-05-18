---
title: Runners
description: Register where agent workloads run.
order: 18
---

# Runners

A runner is a registered execution environment that hosts agent workloads. The Agents Orchestrator picks a runner for each new workload based on the runner's scope, labels, and capabilities.

Two scopes exist:

| Scope | Where the runner is registered | Who can use it |
|---|---|---|
| **Cluster-scoped** | By a cluster admin in Cluster Administration | Available to every organization. |
| **Org-scoped** | By an org owner in the organization's Runners section | Available only to that organization. |

This page covers org-scoped runners. For cluster-scoped runners, see [Cluster administration → Runners](./cluster-administration.md#manage-cluster-scoped-runners).

## When to register an org-scoped runner

- You need workloads to run inside your own Kubernetes cluster, not the shared platform pool.
- You have GPU or other specialized hardware your org reserves for its own agents.
- You need network isolation that requires the runner to live in a specific VPC.
- You are running a third-party runner implementation.

If you have none of these, use the platform's cluster-scoped runner.

## Register a runner

### In the Console

1. Console → **Runners** (`/organizations/<org>/runners`).
2. Click **Register runner**.
3. Set:
   - **Name** — display name (e.g. `team-runner-us-east-1`).
   - **Labels** — `key=value` pairs for [selection](#selection) (e.g. `region=us-east-1`, `team=ml`).
   - **Capabilities** — list of capability names (e.g. `docker`, `gpu`). Workloads requesting a capability only run on runners that advertise it.
4. Save. The Console shows a one-time **service token**. Copy it now — it is not retrievable later.

![Register org runner with service token](../_assets/console/runners/register.png)

The runner's **Status** is `pending` until it enrolls.

### With Terraform

```hcl
resource "agyn_runner" "team_runner" {
  organization_id = agyn_organization.acme.id

  name = "team-runner-us-east-1"

  labels = {
    region = "us-east-1"
    team   = "ml"
  }

  capabilities = ["docker", "gpu"]
}
```

The `service_token` output is a sensitive Terraform value. Feed it to your runner's deployment via your Secrets manager.

## Enroll the runner

After registration, deploy the runner. The platform-provided [k8s-runner](https://github.com/agynio/k8s-runner) is the default Kubernetes implementation:

```sh
helm install team-runner agyn/k8s-runner \
  --namespace agyn-runners --create-namespace \
  --set serviceToken=<token> \
  --set gateway.url=https://gateway.agyn.example.com
```

On first start, the runner exchanges its service token for an OpenZiti identity via the platform's Runners service. The runner's status flips from `pending` to `enrolled`. After that, the orchestrator can place workloads on it.

Service tokens are long-lived and reusable. If the runner restarts, it re-enrolls with the same token and gets a new OpenZiti identity.

## Selection

When the orchestrator needs to start a workload, it picks a runner using:

1. **Scope filtering** — eligible runners = the org's runners + all cluster-scoped runners (status `enrolled` only).
2. **Label matching** — if the agent has `runner_labels`, only runners whose `labels` contain every key-value pair qualify. Runners may have additional labels.
3. **Capability matching** — if the agent requires `capabilities`, only runners whose `capabilities` include every entry qualify. Runners may advertise more.
4. **Random pick** from the qualifying set.

If no runner qualifies, the workload fails to schedule with an error naming the unmet constraint.

## Inspect a runner

### In the Console

1. Runners list → click a row.
2. The detail page shows:
   - Status (`pending`, `enrolled`, `offline`).
   - Labels and capabilities.
   - Active workloads on this runner.
   - The OpenZiti service name (`runner-<id>`).

![Runner detail page](../_assets/console/runners/detail.png)

## Edit labels or capabilities

Labels and capabilities are mutable.

### In the Console

1. Runner detail → **Edit** → update labels or capabilities → save.

Existing workloads on the runner are unaffected; selection for future workloads uses the new values.

### With Terraform

Update `labels` or `capabilities` in the resource and apply.

## Delete a runner

Deleting a runner registration:

- Stops the orchestrator from scheduling new workloads on it.
- Does not stop workloads currently running on it — those continue until they finish or are stopped manually.
- Removes the runner's OpenZiti identity and per-runner service.

### In the Console

1. Runner detail → kebab menu → **Delete**.
2. Confirm. If active workloads exist, stop them first or accept that they will be lost on next reconciliation.

### With Terraform

Delete the resource block and apply.

## Related

- [Cluster administration → Cluster runners](./cluster-administration.md#manage-cluster-scoped-runners)
- [Monitoring → Workloads](./monitoring.md#workloads) — see live workload distribution across runners.
- [Operate → Runners](../operate/runners.md) — deeper operator view.
