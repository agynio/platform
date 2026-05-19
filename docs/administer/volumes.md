---
title: Volumes
description: Persistent disks attached to agents, MCPs, and hooks.
order: 12
---

# Volumes

A volume is a persistent disk attached to a container in an agent workload. Volumes survive across workload restarts (within the same thread) and let agents maintain working state — checkout caches, partial work, learned data — without storing it in a database.

## Volume lifecycle

A volume in the platform has two layers:

- **Volume definition** — the configuration record stored in the Agents service. Has a name, size, and mount path. Does not occupy disk until it is provisioned.
- **Volume instance** — the actual provisioned disk on a runner. One definition can have multiple instances — typically one per thread the agent participates in.

Instances are created on demand by the orchestrator when an agent starts a workload that needs the volume. They are cleaned up when:

- The volume definition is deleted, **or**
- The thread is archived and the cleanup window passes.

You inspect instances under [Monitoring → Storage](./monitoring.md#storage).

## Create a volume definition

### In the Console

1. Console → **Volumes** (`/organizations/<org>/volumes`).
2. Click **New volume**.
3. Set:
   - **Name** — display name.
   - **Size** — disk size in GB.
   - **Mount path** — where the volume is mounted in the container (e.g. `/workspace`).
4. Save.


### With Terraform

```hcl
resource "agyn_volume" "workspace" {
  organization_id = agyn_organization.acme.id

  name       = "workspace"
  size_gb    = 10
  mount_path = "/workspace"
}
```

## Attach a volume

Volumes by themselves do nothing — you must attach them to an agent, MCP server, or hook for them to mount inside the workload.

### In the Console

1. Console → **Agents → <agent>** → **Volume attachments** tab.
2. Click **Attach volume**.
3. Pick a volume and the target container (the agent itself, one of its MCPs, or one of its hooks).
4. Save.


Attachments take effect on the next workload start.

### With Terraform

```hcl
resource "agyn_agent_volume_attachment" "workspace_on_support" {
  agent_id  = agyn_agent.support.id
  volume_id = agyn_volume.workspace.id
}
```

Attach to an MCP or hook by specifying `mcp_id` or `hook_id` instead of (or in addition to) `agent_id`.

## Storage class and sizing

Volumes are provisioned as Kubernetes PVCs with the default `ReadWriteOnce` storage class on the runner's cluster. The size is fixed at creation; resizing is not currently supported — create a new volume and migrate data manually if you need more space.

## When to use a volume

| Scenario | Volume? |
|---|---|
| Agent needs to remember context across runs in the same thread | Yes |
| Agent works on a long-lived code workspace (git checkout, build artifacts) | Yes |
| Agent calls an MCP whose state is purely in an external system | No |
| You want to share state across threads or agents | No — use external storage or a shared MCP backend instead |

Per-thread volume instances are sized once and used independently. If you need shared state across threads, store it externally and let the agent read/write it through an MCP server.

## Delete a volume

Deleting a volume definition removes its configuration. Existing instances are marked for deprovisioning; the runner removes the PVCs in the background.

### In the Console

1. Volumes list → kebab menu → **Delete**.
2. Confirm. The Console warns about active instances.

### With Terraform

Delete the resource block and apply. Terraform issues `DeleteVolume`.

## Related

- [Agents](./agents.md)
- [MCP servers](./mcp-servers.md)
- [Hooks](./hooks.md)
- [Monitoring](./monitoring.md) — see live volume instance state.
