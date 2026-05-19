---
title: Monitoring
description: Live views of workloads, volumes, threads, and usage.
order: 22
---

# Monitoring

The Console's **Activity** section surfaces what is happening in your organization right now. Four tabs:

| Tab | What it shows |
|---|---|
| **Workloads** | Active and recent agent workloads — which agent, on which runner, in what state. |
| **Storage** | All persistent volume instances — what each one is attached to and how much space it uses. |
| **Threads** | Every conversation in the organization, read-only — useful for troubleshooting. |
| **Usage** | Token, compute, storage, and platform-activity metrics. |

All four are restricted to organization owners.

## Workloads

### In the Console

Console → **Activity → Workloads** (`/organizations/<org>/activity/workloads`).

The list shows each running or recently completed workload:

| Column | Notes |
|---|---|
| **Agent** | Display name of the agent. |
| **Runner** | Runner the workload is on. |
| **Thread ID** | The conversation the workload serves. Click to open the thread. |
| **Status** | `starting`, `running`, `stopping`, `stopped`, `failed`. |
| **Containers** | State summary (init/main/sidecar counts). |
| **Started** | Workload start time. |
| **Duration** | Time since start. |


Filter by agent, runner, status, or start time. Sort by any column. Filters are server-side and survive pagination.

### Workload detail

Click a row to open the detail panel:

- **Metadata** — workload ID, runner ID, thread ID, agent, status, container counts.
- **Container list** — init containers first, then the main container, then sidecars. Each shows name, role, image, current state, runtime reason (e.g. `ContainerCreating`, `Running`, `OOMKilled`), exit code, restart count.
- **Log viewer** — last 1000 lines of the selected container's logs, plus a follow toggle for real-time streaming. Empty state if the container no longer exists.


### Stop a workload

Workload detail → **Stop**. The orchestrator transitions the workload to `stopping`, then `stopped`. The agent receives a SIGTERM and has the grace period to exit cleanly.

You can also stop a workload to force a configuration reload (it picks up the latest agent spec on next start).

## Storage

### In the Console

Console → **Activity → Storage** (`/organizations/<org>/activity/storage`).

The list shows every provisioned volume instance:

| Column | Notes |
|---|---|
| **Name** | The volume definition's name. |
| **Size** | Disk size in GB. |
| **Used** | Actual disk used (refreshed periodically). |
| **Attached to** | The container holding it open — agent / MCP / hook / `unattached`. Shows the first attachment and `+N more` if multiple. |
| **Status** | `provisioning`, `active`, `deprovisioning`, `deleted`, `failed`. |

Filter by status, runner, or what kind of resource the volume is attached to.


A volume instance has the same lifetime as the workload that holds it, unless the volume definition is shared across multiple workloads on the same thread.

## Threads

### In the Console

Console → **Activity → Threads** (`/organizations/<org>/activity/threads`).

Every conversation in the organization, listed read-only. Useful for:

- Troubleshooting a user-reported issue without joining the conversation.
- Auditing what agents have been doing.
- Seeing the cluster admin's view of all conversations.

| Column | Notes |
|---|---|
| **ID** | Truncated thread ID. |
| **Participants** | Comma-separated `@nicknames`. |
| **Messages** | Total message count. |
| **Status** | `active`, `archived`, `degraded`. |
| **Created** | First message timestamp. |


Click a row to open the thread detail — paginated message history, newest first, read-only. You cannot post or modify; for that, join the conversation as a participant in Chat.

## Usage

### In the Console

Console → **Activity → Usage** (`/organizations/<org>/activity/usage`).

A one-page dashboard of four sections:

- **LLM** — tokens (input, cached, output), successful and failed requests. Top consumers, top models.
- **Compute** — CPU-core-hours and RAM-GB-hours. Top agents.
- **Storage** — Storage-GB-hours. Top agents.
- **Platform** — threads created, messages sent.


Time range selector at the top: 24 hours, 7 days, 30 days, or custom. Granularity (5-minute / 1-hour / 6-hour / 1-day buckets) is chosen automatically based on range.

For the user-facing equivalent (per-account view), see [Use → Usage](../use/usage.md).

## Real-time updates

All four views subscribe to platform events over WebSocket. New workloads, status transitions, volume changes, and message activity appear without refreshing. With active filters, the page refetches to keep the filtered view consistent.

## Related

- [Runners](./runners.md) — manage where workloads run.
- [Volumes](./volumes.md) — define the volumes that show up under Storage.
- [Use → Usage](../use/usage.md) — same data, user view.
- [Operate → Monitoring](../operate/monitoring.md) — operator view including platform-level metrics.
