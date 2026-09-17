---
title: Runners
description: Deploy, register, size, and observe runners.
order: 5
---

# Runners

A runner is the thing that actually creates agent pods. The platform ships a default Kubernetes runner (`k8s-runner`); third-party implementations are possible if you want to host workloads on something else.

For the admin-side view (registering runners through the Console), see [Administer → Runners](../administer/runners.md). This page is the operator's view.

## Cluster vs. org scopes

- **Cluster-scoped runners** belong to no organization. The orchestrator can place workloads from any organization on them. Useful for shared compute pools.
- **Org-scoped runners** belong to one organization. The orchestrator places only that organization's workloads on them.

Both kinds register the same way — only the `organization_id` differs. Cluster-scoped runners require cluster admin to register.

## Deploy the platform-provided k8s-runner

Bootstrap installs an in-cluster k8s-runner automatically as part of the `apps` stack. To deploy additional runners (different cluster, separate node pool, isolated namespace), install the chart directly from its OCI repository:

```sh
helm install acme-runner oci://ghcr.io/agynio/charts/k8s-runner \
  --version <chart-version> \
  --namespace agyn-runners --create-namespace \
  --values runner-values.yaml
```

Minimum `runner-values.yaml`:

```yaml
gateway:
  url: https://gateway.agyn.example.com

serviceToken:
  existingSecret: k8s-runner-token   # Secret with key `token`

resources:
  workloadNamespace: agyn-workloads  # namespace agent pods land in
  pullSecrets: []                    # default image pull secrets if needed

storage:
  class: standard                    # StorageClass for agent volume PVCs

capabilities:
  - docker
```

The runner enrolls with its service token on first start. After enrollment, it accepts `StartWorkload` calls from the orchestrator and provisions pods in `workloadNamespace`.

## Runner catalog: flavors and storage classes

A **flavor** is a named compute size — the sizes your users get to pick from. A
**storage class** is a named storage tier. Together with the runner's
capabilities they form the runner's **catalog**.

The catalog is declared in the runner's own Helm values, not through any
platform API. There is no Console screen and no Terraform resource for it: only
the runner can honour the sizes it advertises, so the sizes live next to the
runner that implements them.

```yaml
catalog:
  flavors:
    - name: ram-2gb
      default: true
      resources:
        requestsCpu: "500m"
        requestsMemory: "2Gi"
        limitsCpu: "2"
        limitsMemory: "2Gi"
      sidecarResources:
        requestsCpu: "100m"
        requestsMemory: "128Mi"
        limitsCpu: "500m"
        limitsMemory: "256Mi"
    - name: ram-4gb
      resources:
        requestsCpu: "1"
        requestsMemory: "4Gi"
        limitsCpu: "4"
        limitsMemory: "4Gi"

  storageClasses:
    - name: default
      default: true
      storageClassName: ""      # empty = the cluster's default StorageClass
    - name: fast-ssd
      storageClassName: premium-rwo

  capabilities: [docker]
```

`resources` sizes the agent's main container. `sidecarResources` sizes each MCP
sidecar in the workload. One flavor covers both, because a user picks a size for
their workload — not a budget per container. `sidecarResources` is optional; a
flavor without it leaves sidecars unsized.

| Field | Rules |
|---|---|
| `name` | Unique within the runner, max 64 chars, `^[a-z0-9-]+$` |
| `resources` | All four values required |
| `sidecarResources` | Optional — but all four required if you set any |
| `default` | At most one flavor and one storage class may set it |
| `deprecated` | Hides the entry from pickers; existing references still run |

A malformed catalog is rejected at startup with the offending entry named, and
the runner keeps reporting whatever it last reported successfully.

### Applying a catalog change

The runner reports its catalog **once, at startup**. The chart handles this: the
catalog is rendered into a ConfigMap and its checksum is stamped onto the pod
annotations, so `helm upgrade` rolls the runner whenever the catalog changes.

```sh
helm upgrade acme-runner oci://ghcr.io/agynio/charts/k8s-runner \
  --version <chart-version> \
  --namespace agyn-runners \
  --values runner-values.yaml
```

Confirm the report landed:

```sh
kubectl -n agyn-runners logs -l app=k8s-runner | grep "catalog reported"
```

A `catalog report failed; serving without it` line instead means the runner is
up but the platform still has the previous catalog — environments naming a new
flavor stay unschedulable until a report succeeds.

To see what the platform now offers users, open the flavor picker on any
environment in the Console. There is currently no CLI command that lists a
runner's catalog.

### How users reach a flavor

Users never name a flavor on an agent. They name it on an
[environment](../administer/agents.md), which pairs a runner with a flavor from
that runner's catalog; agents and sandboxes then reference the environment.

Names are **late-bound** — resolved at every workload start, not when the
environment is saved. So you can apply platform config and runner config in
either order, and an environment may name a flavor you have not added yet.
The cost is that a name you remove stops scheduling: environments referencing
it are flagged unschedulable rather than being quietly moved somewhere else.

Removing a flavor from your values and upgrading is therefore a breaking change
for anyone using it. Mark it `deprecated` first — it disappears from pickers
while existing environments keep running.

## Pod layout the runner creates

For each agent workload, the runner creates:

```
Pod
├── init container (init image, copies binaries)
├── runtime container (agent runtime image)
├── files-mcp sidecar (if attached)
├── ... other MCP sidecars
└── Ziti sidecar
```

Plus a PVC per attached volume, mounted at the configured path on the relevant container(s).

## Reconciliation

The Runners service holds the source of truth for workload state. The orchestrator:

1. Calls `Runner.StartWorkload` on the selected runner.
2. Writes `CreateWorkload` on the Runners service with status `starting`.
3. Calls `Runner.InspectWorkload` on each reconciliation tick to refresh container state and update the workload record.
4. Calls `Runner.StopWorkload` when the workload should stop (idle timeout, resolved conversation, manual stop).
5. Writes `UpdateWorkload(removed_at=now)` to mark the workload deprovisioned.

The runner is otherwise passive — it doesn't pull work, it doesn't notify when things happen on its own. The orchestrator drives.

## Health classification

The orchestrator monitors workload health using container reasons:

| Threshold | Default | Trigger |
|---|---|---|
| `START_GRACE_S` | 60s | After start, if status is not `running`, escalate. |
| `INIT_RETRY_THRESHOLD` | 3 | Init containers retrying more than this → `failed`. |
| `CRASHLOOP_THRESHOLD` | 3 | Main container restart count over this → `crashloop`. |

Failed workloads transition to `failed` with one of these reasons:

- `start_failed` — workload never reached running.
- `image_pull_failed` — registry credentials or networking issue.
- `config_invalid` — `agynd` rejected configuration.
- `crashloop` — main container repeatedly crashed.
- `runtime_lost` — runner stopped reporting on the workload.

## Sizing

A runner can host many concurrent workloads. Capacity depends on:

- Available node CPU/memory in the runner's cluster.
- The [flavors](#runner-catalog-flavors-and-storage-classes) you declare, and which ones your environments name — a flavor's `resources` is reserved on a node for as long as the workload runs.
- Number of MCP sidecars per agent — each is sized by the flavor's `sidecarResources`, so a workload's real footprint is `resources` plus `sidecarResources` times its sidecar count.
- StorageClass IOPS — agent volumes can be IO-bound for some workloads.

Practical guidance:

- Start with 4 vCPU / 16 GiB nodes and scale horizontally.
- Watch the runner's pod count, average concurrent workloads, p95 LLM-call latency, and Postgres WAL lag (Tracing and Threads write a lot).
- For GPU workloads: use a separate runner with `capabilities: [gpu]` and an appropriate node pool. The orchestrator only schedules GPU-requesting agents on it.

## Multiple runners

You can register many runners. Some patterns:

- **Per-region runners** — `labels: { region: "eu-west-1" }` on the runner, same `runner_labels` on agents. The orchestrator only places eu-west-1 agents on eu-west-1 runners.
- **Per-team runners** — `organization_id` set, agents in that org default to its runner.
- **Tiered runners** — different node sizes. Use `labels: { tier: "high-memory" }` and require it via the agent's `runner_labels`.

The orchestrator's selection is: scope-filtered → label-matched → capability-matched → random pick. See [Administer → Runners](../administer/runners.md#selection).

## Observability

Runner-level observability:

- **Pods**: `kubectl -n agyn-runners get pods -l app=k8s-runner` for the runner itself.
- **Workload pods**: `kubectl -n agyn-workloads get pods` for the agent pods the runner created.
- **Runners service**: the Console's Runners section for state from the platform's perspective — enrollment status, labels, and the workloads currently on each runner.
- **Tracing**: every workload's lifecycle generates spans you can see in the Tracing service.

If a runner stops reporting, the orchestrator marks its workloads `failed` with reason `runtime_lost` after a grace period.

## Third-party runners

The Runner gRPC contract is public — you can write your own runner targeting a different backend (Nomad, Fly Machines, even a single VM). It needs to:

- Accept `EnrollRunner` via the platform's service token flow.
- Implement `StartWorkload`, `StopWorkload`, `InspectWorkload`, `StreamWorkloadLogs`.
- Provision the same pod layout (or its equivalent) — init, runtime, MCP sidecars, volumes.

See the `agynio/runner` proto file in `agynio/api`.

## Related

- [Administer → Runners](../administer/runners.md)
- [Architecture overview](./architecture.md)
- [Scaling](./scaling.md)
- [Monitoring](./monitoring.md)
