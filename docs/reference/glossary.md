---
title: Glossary
description: Every term used across Agyn.
order: 1
---

# Glossary

Same terms as in [Introduction → Concepts](../introduction/concepts.md), plus operator-specific terminology and cross-links to where each concept is configured or used.

## Identity & access

| Term | Definition | Where it appears |
|------|------------|------------------|
| **Identity** | A unique entity (user, agent, runner, app) with a platform-wide UUID. | [Operate → Identity](../operate/identity.md) |
| **User** | Human identity, provisioned on first OIDC login. | [Operate → Identity](../operate/identity.md) |
| **Agent** | AI identity, configured as an Agent resource and run as a workload on demand. | [Administer → Agents](../administer/agents.md) |
| **Runner** | Identity that hosts workloads. Cluster- or org-scoped. | [Administer → Runners](../administer/runners.md), [Operate → Runners](../operate/runners.md) |
| **App** | Independently deployed service that participates in conversations as itself. | [Administer → Apps](../administer/apps.md), [Build & extend → Apps](../build-extend/apps.md) |
| **Organization** | Multi-tenant boundary grouping users, agents, models, secrets, runners, apps. | [Administer → Organizations](../administer/organizations.md) |
| **Cluster admin** | Platform-wide administrative role. | [Self-host install → First admin](../self-host-install/first-admin.md), [Administer → Cluster administration](../administer/cluster-administration.md) |
| **Organization owner** | Per-organization administrative role. | [Administer → Organizations](../administer/organizations.md) |
| **Organization member** | Non-owner participant. No Console access. | [Administer → Members](../administer/members.md) |
| **Agent role** | Per-agent grant: `owner`, `maintainer`, `participant`. | [Administer → Agent roles](../administer/agent-roles.md) |
| **API token** | Long-lived credential for programmatic access. Format `agyn_<44 chars>`. | [Use → API tokens](../use/api-tokens.md) |
| **OIDC subject** | The IdP-issued `sub` claim that uniquely identifies a user. | [Operate → Identity](../operate/identity.md) |

## Conversation

| Term | Definition | Where it appears |
|------|------------|------------------|
| **Conversation** | Persistent exchange between participants. Lifecycle: open → resolved. | [Use → Chat](../use/chat.md) |
| **Thread** | The storage record behind a conversation. | [Use → Chat](../use/chat.md), [Operate → Architecture](../operate/architecture.md) |
| **Chat** | The platform's user-facing communication interface. | [Use → Chat](../use/chat.md) |
| **Participant** | User, agent, or app in a conversation. | [Use → Chat](../use/chat.md) |
| **Reminder** | Agent-scheduled follow-up. | [Use → Reminders](../use/reminders.md), [Administer → Reminders app](../administer/reminders-app.md) |
| **Conversation status** | User-controlled state: `Open` or `Resolved`. | [Use → Chat](../use/chat.md) |
| **Activity status** | System-derived state: `Running`, `Pending`, `Finished`. | [Use → Chat](../use/chat.md) |
| **Degraded thread** | Unrecoverable state — read-only conversation. | [Use → Chat](../use/chat.md) |

## Agent

| Term | Definition | Where it appears |
|------|------------|------------------|
| **Agent availability** | `internal` (any org member) or `private` (role-restricted). | [Administer → Agents](../administer/agents.md) |
| **Runtime image** | Container image the agent CLI runs in. | [Administer → Agents](../administer/agents.md) |
| **Init image** | Container image that bootstraps `agynd` and the agent CLI. | [Administer → Agents](../administer/agents.md), [Build & extend → Agent CLIs](../build-extend/agent-clis.md) |
| **Idle timeout** | Duration of CLI silence after which the workload stops. | [Administer → Agents](../administer/agents.md) |
| **MCP server** | Model Context Protocol server providing tools. Sidecar in the agent pod. | [Administer → MCP servers](../administer/mcp-servers.md), [Build & extend → MCP servers](../build-extend/mcp-servers.md) |
| **Tool** | A capability exposed by an MCP server. | [Build & extend → MCP servers](../build-extend/mcp-servers.md) |
| **Skill** | Prompt fragment placed on the agent's filesystem. | [Administer → Skills](../administer/skills.md) |
| **Hook** | Event-driven sidecar. | [Administer → Hooks](../administer/hooks.md) |
| **Volume** | Persistent disk attached to an agent or sub-resource. | [Administer → Volumes](../administer/volumes.md) |
| **Init script** | Shell script run before the agent CLI starts. | [Administer → Init scripts](../administer/init-scripts.md) |
| **Environment variable** | Plain or secret-backed value injected into a container. | [Administer → Environment variables](../administer/environment-variables.md) |

## Run & observability

| Term | Definition | Where it appears |
|------|------------|------------------|
| **Run** | A single execution cycle of an agent processing unacknowledged messages. | [Use → Run Timeline](../use/run-timeline.md) |
| **Run event** | A discrete step within a run (message, LLM call, tool execution, summarization). | [Use → Run Timeline](../use/run-timeline.md) |
| **Workload** | A running agent pod. | [Administer → Monitoring](../administer/monitoring.md), [Operate → Runners](../operate/runners.md) |
| **Container** | Individual container within a workload. | [Administer → Monitoring](../administer/monitoring.md) |
| **Context** | Items assembled into a prompt for an LLM call. | [Use → Run Timeline](../use/run-timeline.md) |
| **Summarization** | Run event compressing context to stay under token limits. | [Use → Run Timeline](../use/run-timeline.md) |
| **Trace** | Recorded sequence of events for a run. | [Use → Run Timeline](../use/run-timeline.md) |
| **Span** | A single unit in the trace; OTLP-style. | [Operate → Architecture](../operate/architecture.md) |

## Models & secrets

| Term | Definition | Where it appears |
|------|------------|------------------|
| **LLM provider** | Configured upstream model provider (OpenAI, Anthropic, etc.). | [Administer → LLM providers](../administer/llm-providers.md) |
| **Model** | Platform-side identifier (`gpt-4o`) mapped to a provider and remote model name. | [Administer → Models](../administer/models.md) |
| **Secret** | Credential value, stored locally or by reference to an external provider. | [Administer → Secrets](../administer/secrets.md) |
| **Secret provider** | External secret store the platform reads at workload start. | [Administer → Secret providers](../administer/secret-providers.md) |
| **Image pull secret** | Registry credentials for pulling private images. | [Administer → Image pull secrets](../administer/image-pull-secrets.md) |

## Infrastructure

| Term | Definition | Where it appears |
|------|------------|------------------|
| **Gateway** | External API entry point speaking ConnectRPC / gRPC. | [Build & extend → Gateway API](../build-extend/gateway-api.md), [Operate → Architecture](../operate/architecture.md) |
| **OpenZiti** | Zero-trust overlay network for agents, apps, runners, devices. | [Operate → Networking](../operate/networking.md) |
| **Istio** | Service mesh for in-cluster mTLS and authorization. | [Operate → Networking](../operate/networking.md) |
| **OpenFGA** | ReBAC engine backing the Authorization service. | [Operate → Authorization](../operate/authorization.md) |
| **Device** | Personal endpoint enrolled into OpenZiti. | [Use → Devices](../use/devices.md) |
| **Port exposure** | Reachable endpoint for a service inside an agent container. URL `http://exposed-<id>.ziti:<port>`. | [Use → Port exposure](../use/port-exposure.md) |
| **Notification** | Real-time event delivered to UIs via WebSocket. | [Operate → Architecture](../operate/architecture.md) |

## Components & repositories

| Term | Definition |
|------|------------|
| **agynd** | Wrapper daemon running inside every agent pod. Bridges any agent CLI with the platform. |
| **agyn CLI** | Platform CLI for interactive and scripting access. |
| **agn CLI** | Agyn's native agent loop implementation. |
| **Codex** | OpenAI's agent loop, supported via `agent-init-codex`. |
| **Claude Code** | Anthropic's agent loop, supported via `agent-init-claude`. |
| **files-mcp** | Platform-provided MCP server exposing `read_file`. |
| **Console app** | Browser management UI. |
| **Chat app** | Browser chat UI. |
| **Tracing app** | Browser run-inspection UI. |
| **k8s-runner** | Default Kubernetes runner implementation. |
| **bootstrap** | Local development install via Terraform + k3d. |
| **platform-charts** | Production Helm umbrella charts. |
| **terraform-provider-agyn** | Terraform provider for the Gateway API. |
| **agynio/api** | Protobuf schemas for every service. |

## Related

- [Introduction → Concepts](../introduction/concepts.md) — the same set, organized for first-time readers.
- [Service catalog](./service-catalog.md) — every service component.
