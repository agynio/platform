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

## Pod layout the runner creates

For each agent workload, the runner creates:

```
Pod
├── init container (init image, copies binaries)
├── runtime container (agent runtime image)
├── files-mcp sidecar (if attached)
├── ... other MCP sidecars
├── ... hook sidecars
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
- Each agent's `compute` resource requests/limits.
- Number of MCP sidecars per agent (each consumes some CPU/memory).
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
- **Runners service**: `agyn runners list -o json` for state from the platform's perspective.
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
