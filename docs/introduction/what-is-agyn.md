---
title: What is Agyn
description: Vision, value proposition, and target users.
order: 1
---

# What is Agyn

Agyn is a platform for running AI agents that collaborate with humans through conversation. Users interact with agents in a chat interface — persistent exchanges where agents reason, use tools, and produce results. The platform handles agent lifecycle, tool connectivity, observability, and multi-tenant isolation, so teams can deploy and operate agents without building infrastructure.

## Value proposition

- **Conversational agent interaction.** Users work with agents through a familiar messaging interface — not dashboards or pipelines.
- **Full execution observability.** Every LLM call, tool execution, and context decision is recorded and inspectable in real time.
- **Managed agent lifecycle.** The platform provisions, schedules, and tears down agent workloads automatically.
- **Tool connectivity via MCP.** Agents access external tools through Model Context Protocol servers with secure networking.
- **Multi-tenant by default.** Organizations, agents, and data are isolated through relationship-based access control.

## Target users

| Persona | What they do |
|---------|--------------|
| **End user** | Delegate tasks to agents in chat, review results, manage ongoing conversations. |
| **Organization admin** | Configure agents, models, secrets, runners, apps, and members for their organization. |
| **Cluster admin / platform operator** | Install Agyn on a Kubernetes cluster, manage cluster-scoped runners, oversee organizations. |
| **Developer** | Integrate with the Gateway API, manage resources via Terraform, write MCP servers, build apps. |

## Product principles

- **Conversation is the interface.** Every interaction starts and ends in a conversation. There are no workflow builders, DAG editors, or batch job UIs.
- **Observability is not optional.** Every agent run produces a complete, inspectable trace. You never wonder *what did the agent do?*
- **Desired state, not procedures.** Agents are declared as resources (model, tools, secrets, image). The platform reconciles toward that desired state.

## What this means for you

If you are a user, you spend your time in [Chat](../use/chat.md) and the [Run Timeline](../use/run-timeline.md). If you are an admin, you spend it in the [Console](../administer/console-overview.md) or in [Terraform](../administer/terraform.md). If you are an operator, you spend it in your cluster — see [Self-host install](../self-host-install/README.md) to get started.

## Related

- [Concepts](./concepts.md)
- [Architecture at a glance](./architecture.md)
- [Choose your path](./choose-your-path.md)
