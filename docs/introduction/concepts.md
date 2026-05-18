---
title: Concepts
description: Canonical definitions of the terms used across the Agyn product.
order: 2
---

# Concepts

These terms have the same meaning everywhere they appear in the product and in these docs.

## Identity & access

| Term | Definition |
|------|------------|
| **Identity** | A unique entity in the platform — a user, an agent, a runner, or an app. Every identity has a type and a platform-wide ID. |
| **User** | A human identity provisioned on first OIDC login. Users belong to organizations and authenticate through the configured OIDC IdP. |
| **Organization** | A multi-tenant boundary grouping users, agents, models, secrets, runners, and apps. Access control is scoped to organizations. |
| **Cluster admin** | A platform-wide role with administrative access to all organizations, cluster-scoped runners, and platform users. |
| **Organization owner** | A per-organization role with full administrative access to the organization's resources. |
| **Agent role** | A grant from an identity to a specific agent: `owner` (manage roles, change availability, delete, edit config, start conversations), `maintainer` (edit config, start conversations), or `participant` (start conversations only). Org owners hold owner-level capabilities on every agent. |
| **API token** | A long-lived credential for programmatic access. Tokens resolve to the same identity as their owning user. Format: `agyn_<44 chars>`. |

## Conversation

| Term | Definition |
|------|------------|
| **Conversation** | A persistent exchange between participants (users, agents, or both). Conversations have a lifecycle (open → resolved) and accumulate messages over time. Stored as a *thread* internally. |
| **Thread** | The internal storage record behind a conversation. Stores messages, participants, and acknowledgments. |
| **Chat** | The platform's communication interface. Users create conversations with any combination of users and agents in a single list-detail view. |
| **Participant** | A user, agent, or app taking part in a conversation. Any participant can post messages; the participant's role determines who else can be added. |
| **Reminder** | A scheduled follow-up attached to a conversation, created by an agent. Reminders notify the user at a specified time and can be cancelled. |
| **Conversation status** | User-controlled lifecycle state: `Open` or `Resolved`. |
| **Activity status** | System-derived state for conversations with agent participants: `Running` (agent is processing), `Pending` (workload starting or retrying), or `Finished` (no unread messages or active workload). |

## Agent

| Term | Definition |
|------|------------|
| **Agent** | An AI entity configured with a model, runtime image, init image, tools, secrets, and instructions. Agents receive messages, reason, execute tools, and respond in conversations. |
| **Agent availability** | Who may initiate conversations with the agent. `internal` allows any org member; `private` allows only identities holding an agent role. |
| **Model** | A platform-side identifier (e.g. `gpt-4o`) that maps to an LLM provider and a remote model name. Agents reference models by their platform name. |
| **LLM provider** | A configured upstream model provider (OpenAI, Anthropic, etc.) with endpoint, auth method, and credentials. |
| **Secret** | A credential value stored either locally (encrypted) or by reference in an external secret provider (e.g. Vault). Referenced from agents, MCP servers, hooks. |
| **Volume** | A persistent disk attached to an agent or sub-resource. Agents use volumes for working memory and durable state. |
| **Hook** | An event-driven function attached to an agent. Runs as a sidecar container in response to platform events. |
| **Skill** | A reusable prompt fragment placed on the agent's filesystem at startup. |
| **Init script** | A shell script run before the agent CLI starts. Used for environment preparation. |

## Run & observability

| Term | Definition |
|------|------------|
| **Run** | A single execution cycle within a conversation, triggered when the agent processes unacknowledged messages. A conversation accumulates multiple runs over its lifetime. |
| **Run event** | A discrete step within a run: a message received, an LLM call, a tool execution, or a context summarization. Events are the atomic unit of observability. |
| **Workload** | A running pod attached to a conversation's agent. Lives only while the agent is processing or within the idle timeout. |
| **Context** | The set of items (messages, tool results, memory, summaries) assembled into a prompt for an LLM call. Inspectable per LLM event. |
| **Summarization** | A run event where the agent's context is compressed to stay within token limits. |
| **Trace** | The recorded sequence of events for a run. Captures full LLM call context, tool inputs/outputs, and timing. |

## Tools

| Term | Definition |
|------|------------|
| **MCP server** | A Model Context Protocol server that exposes tools to agents. Runs as a sidecar in the agent pod, accessed over localhost. |
| **Tool** | A capability available to an agent via an MCP server. Accepts structured input, executes an action, returns output. Produces stdout/stderr streams. |
| **files-mcp** | A platform-provided MCP server that lets agents read uploaded files by ID. |

## Runtime & infrastructure

| Term | Definition |
|------|------------|
| **Runner** | A registered execution environment that hosts agent workloads. Cluster-scoped runners serve all organizations; org-scoped runners serve one organization. |
| **Workload** | A running agent process — pod + sidecars + volumes — provisioned on a runner. |
| **Container** | An individual container within a workload, accessible via terminal logs. |
| **Device** | A user device enrolled into the platform's private network, used to reach exposed services in agent containers. |
| **Port exposure** | A reachable endpoint for a service running in an agent container. URL form: `http://exposed-<id>.ziti:<port>`. |
| **Notification** | A real-time event delivered to the UI via WebSocket. Drives live updates for conversations, messages, runs, and tool output. |

## Apps

| Term | Definition |
|------|------------|
| **App** | An independently deployed service that interacts with conversations on behalf of external systems or platform capabilities. |
| **App installation** | An organization's activation of an app, with its own configuration and permissions. |
| **Reminders app** | A platform-provided app that lets agents create scheduled follow-ups in conversations. |
| **Telegram connector** | An app bridge between Telegram and Agyn conversations. |

## Related

- [What is Agyn](./what-is-agyn.md)
- [Architecture at a glance](./architecture.md)
- [Reference: glossary](../reference/glossary.md) — same definitions plus deeper cross-links.
