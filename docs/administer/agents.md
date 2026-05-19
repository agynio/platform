---
title: Agents
description: Create and configure agents.
order: 5
---

# Agents

An agent is an AI entity that participates in conversations. It is defined by a configuration record that specifies the LLM model it uses, the container images that run it, the tools it can call, the secrets it has access to, and its runtime behavior (idle timeout, compute limits, availability).

You configure the desired state. The platform reconciles workloads toward it — agents do not run continuously, they spin up on demand when there are messages to process.

## Prerequisites

Before creating an agent, you need:

- At least one [LLM provider](./llm-providers.md) registered.
- At least one [model](./models.md) registered.
- A runtime [container image](#runtime-image) and matching [init image](#init-image) selected — the platform provides defaults for Codex, Claude Code, and the native `agn` CLI.
- Optionally: [secrets](./secrets.md), [MCP servers](./mcp-servers.md), [volumes](./volumes.md), [hooks](./hooks.md), [skills](./skills.md), [environment variables](./environment-variables.md), [init scripts](./init-scripts.md).

## Create an agent

### In the Console

1. Console → **Agents** (`/organizations/<org>/agents`).
2. Click **New agent**.
3. Fill in the fields described below.
4. Click **Create**. The agent is created and you are redirected to its detail page.


#### Required fields

| Field | Notes |
|---|---|
| **Name** | Display name. Shown in chat and lists. |
| **Nickname** | `@`-mention handle. Unique within the organization. Used in conversations. |
| **Description** | Optional but recommended — appears next to the agent in chat composers. |
| **Role** | A short label for the agent's purpose (`assistant`, `reviewer`, `support`, etc.). Free-text — affects display only. |
| **Model** | Pick from the org's registered models. |
| **Runtime image** | Container image for the agent runtime (the dev container, e.g. `ghcr.io/agynio/agent-runtime:v1.0.0`). |
| **Init image** | The init container providing `agynd` and the agent CLI. Pick one for Codex, Claude Code, or `agn` — see [Init image](#init-image) below. |
| **Idle timeout** | Duration after the agent stops producing output before the workload is stopped. Default `5m`. |
| **Availability** | `internal` (any org member can start a conversation) or `private` (role-restricted). See [Agent roles](./agent-roles.md). |

#### Optional fields

- **Compute resources** — CPU and memory requests/limits for the runtime container.
- **Runner labels** — `key=value` pairs the workload must match against a runner's labels. See [Runners](./runners.md).
- **Capabilities** — `gpu`, `docker`, etc. The orchestrator schedules only on runners advertising every capability.
- **Behavioral configuration** — JSON blob passed to the agent CLI on startup. Schema depends on the chosen CLI.

After creation, the **agent detail page** opens. Sub-resources (MCPs, hooks, skills, ENVs, init scripts, volumes, image pull secret attachments) are configured as tabs on this page.


### With Terraform

```hcl
resource "agyn_agent" "support" {
  organization_id = agyn_organization.acme.id

  name        = "Support Agent"
  nickname    = "support"
  description = "Front-line customer support."
  role        = "assistant"

  model      = agyn_llm_model.gpt_4o.name
  image      = "ghcr.io/agynio/agent-runtime:v1.0.0"
  init_image = "ghcr.io/agynio/agent-init-codex:v1.0.0"

  idle_timeout = "5m"
  availability = "internal"

  compute = {
    cpu_request    = "500m"
    cpu_limit      = "2"
    memory_request = "512Mi"
    memory_limit   = "2Gi"
  }
}
```

The creator's identity is granted `owner` on the new agent automatically. Add roles for other identities through [Agent roles](./agent-roles.md).

## Runtime image

The runtime image is the container that hosts the agent's working environment — typically a dev container with the tools the agent needs (curl, git, language toolchains, etc.). The platform provides a default `agent-runtime` image; you can use your own image as long as it includes the few binaries `agynd` expects in PATH.

The runtime image is the image the agent CLI **runs in**. It is separate from the init image, which **bootstraps** the agent CLI itself.

## Init image

The init image is a small image whose only job is to copy `agynd`, the platform CLI, and the agent CLI (Codex, Claude Code, or `agn`) into a shared volume that the runtime container mounts at `/agyn-bin`. This lets you change the agent CLI without rebuilding your runtime image.

| Init image | Agent CLI it installs |
|---|---|
| `ghcr.io/agynio/agent-init-codex:<version>` | OpenAI Codex CLI |
| `ghcr.io/agynio/agent-init-claude:<version>` | Anthropic Claude Code |
| `ghcr.io/agynio/agent-init-agn:<version>` | Agyn's native `agn` CLI |

If you want to add a new agent CLI, see [Build & extend → Agent CLIs](../build-extend/agent-clis.md).

## Idle timeout

While the agent is producing output (executing LLM calls, running tools), `agynd` keeps the workload alive by sending keepalives every 10 seconds. When the agent stops producing output, the keepalives stop. After `idle_timeout` of no keepalives, the workload is shut down.

| Duration | When to use |
|---|---|
| `30s`-`1m` | Short, transactional agents (lookup bots, classifiers). |
| `5m` (default) | General-purpose conversational agents. |
| `15m`-`1h` | Agents whose tools take a long time to return (large jobs, builds). |
| `> 1h` | Use only with cost-conscious deployments — workloads sit idle until the timeout fires. |

`idle_timeout` only starts after the agent goes idle. Long-running tool calls do not trigger it — `agynd` keeps touching the workload while a tool is running.

## Availability

| Value | Who can initiate a conversation with the agent |
|---|---|
| `internal` (default in Console) | Any organization member, plus any identity holding an agent role. |
| `private` | Only identities holding an [agent role](./agent-roles.md). |

Availability does not affect whether the agent is visible — `private` agents still appear in lists. It only gates who can put them in a new conversation.

## Editing and deleting

- Editing the agent applies to **future** workloads. Workloads already running keep their current configuration until they restart.
- Deleting an agent is destructive — it removes the agent and all its sub-resources (MCPs, hooks, skills, etc.). Conversations the agent participated in remain.

You need agent `owner` or org `owner` to delete. Agent `maintainer` can edit configuration but cannot delete or change availability.

## Sub-resources

The agent's tabs in the Console map to separate documentation pages:

- [Agent roles](./agent-roles.md) — who can configure or chat with this agent.
- [MCP servers](./mcp-servers.md) — tools the agent can call.
- [Skills](./skills.md) — prompt fragments on disk at startup.
- [Hooks](./hooks.md) — event-driven sidecars.
- [Environment variables](./environment-variables.md) — plain values and secret references.
- [Init scripts](./init-scripts.md) — shell scripts run before the agent CLI starts.
- [Volumes](./volumes.md) — persistent disks attached to the agent.
- [Image pull secrets](./image-pull-secrets.md) — credentials for pulling the runtime or init image.

## Related

- [Use → Chat](../use/chat.md) — what users do with agents.
- [Use → Run Timeline](../use/run-timeline.md) — inspect what an agent did.
- [Build & extend → Agent CLIs](../build-extend/agent-clis.md) — pick or build the agent loop.
