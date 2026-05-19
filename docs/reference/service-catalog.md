---
title: Service catalog
description: Every Agyn service, what it does, and where its source lives.
order: 2
---

# Service catalog

Every microservice, app, CLI, runtime image, runner, and deployment artifact. Use this as a map when you need to find where a specific piece lives.

## Core platform services

| Service | Description | Repository |
|---|---|---|
| Gateway | External ConnectRPC API entry point. Authenticates every request and routes to internal services. | [agynio/gateway](https://github.com/agynio/gateway) |
| Agents | Stores desired state for agents and sub-resources (MCPs, skills, hooks, ENVs, init scripts, volume attachments, image pull secret attachments). | [agynio/agents](https://github.com/agynio/agents) |
| Agents Orchestrator | Reconciler. Watches thread activity and agent configuration; requests workloads from eligible runners. | [agynio/agents-orchestrator](https://github.com/agynio/agents-orchestrator) |
| Runners | Registry of runners and workload runtime state. | [agynio/runners](https://github.com/agynio/runners) |
| Organizations | Organization lifecycle, memberships, invites. | [agynio/organizations](https://github.com/agynio/organizations) |
| Identity | Central registry mapping identity_id to identity_type. | [agynio/identity](https://github.com/agynio/identity) |
| Users | User records, profiles, API tokens, devices. Provisions users on first OIDC login. | [agynio/users](https://github.com/agynio/users) |
| Authorization | Thin proxy in front of OpenFGA. | [agynio/authorization](https://github.com/agynio/authorization) |
| Chat | Built-in chat experience. Wraps Threads with product behavior. | [agynio/chat](https://github.com/agynio/chat) |
| Threads | Generic conversation storage. Participant-type-agnostic. | [agynio/threads](https://github.com/agynio/threads) |
| Files | File upload, metadata, pre-signed download URLs. S3-backed. | [agynio/files](https://github.com/agynio/files) |
| LLM | LLM provider and model registry. | [agynio/llm](https://github.com/agynio/llm) |
| LLM Proxy | OpenAI- and Anthropic-compatible endpoints for agents. | [agynio/llm-proxy](https://github.com/agynio/llm-proxy) |
| Secrets | Secret providers, secrets, image pull secrets. | [agynio/secrets](https://github.com/agynio/secrets) |
| Notifications | Real-time event fanout. | [agynio/notifications](https://github.com/agynio/notifications) |
| Tracing | OTLP span ingestion and query, with LLM context capture. | [agynio/tracing](https://github.com/agynio/tracing) |
| Metering | Single store for usage records (LLM tokens, compute, storage, platform activity). | [agynio/metering](https://github.com/agynio/metering) |
| Token Counting | Provider-accurate tokenization for cost reporting. | [agynio/token-counting](https://github.com/agynio/token-counting) |
| Media Proxy | Authenticated media serving with SSRF protection. | [agynio/media-proxy](https://github.com/agynio/media-proxy) |
| Ziti Management | Encapsulates OpenZiti Controller operations. | [agynio/ziti-management](https://github.com/agynio/ziti-management) |
| Apps Service | App definitions, installations, enrollment, audit. | [agynio/apps](https://github.com/agynio/apps) |
| Expose | Manages port exposures for agent containers. | [agynio/expose](https://github.com/agynio/expose) |

## User-facing apps

| Service | Description | Repository |
|---|---|---|
| Console App | Management UI SPA. | [agynio/console-app](https://github.com/agynio/console-app) |
| Chat App | Browser chat UI. | [agynio/chat-app](https://github.com/agynio/chat-app) |
| Tracing App | Browser run-inspection UI. | [agynio/tracing-app](https://github.com/agynio/tracing-app) |

## Platform apps and bridges

| Service | Description | Repository |
|---|---|---|
| Reminders | Platform app for scheduled follow-ups. | [agynio/reminders](https://github.com/agynio/reminders) |
| Telegram Connector | Bridge between Telegram and Agyn conversations. | [agynio/telegram-connector](https://github.com/agynio/telegram-connector) |

## Agent runtime and tools

| Service | Description | Repository |
|---|---|---|
| k8s-runner | Default Kubernetes runner implementation. | [agynio/k8s-runner](https://github.com/agynio/k8s-runner) |
| agynd | Wrapper daemon that runs inside every agent pod. | [agynio/agynd-cli](https://github.com/agynio/agynd-cli) |
| agyn CLI | Platform CLI for interactive and scripting access. | [agynio/agyn-cli](https://github.com/agynio/agyn-cli) |
| agn CLI | Agyn's native agent loop. | [agynio/agn-cli](https://github.com/agynio/agn-cli) |
| files-mcp | Platform-provided MCP server for file access. | [agynio/files-mcp](https://github.com/agynio/files-mcp) |
| codex-sdk-go | Go SDK integration for the Codex CLI. | [agynio/codex-sdk-go](https://github.com/agynio/codex-sdk-go) |
| agent-init-codex | Init image bundling agynd, agyn CLI, and the Codex CLI. | [agynio/agent-init-codex](https://github.com/agynio/agent-init-codex) |
| agent-init-claude | Init image bundling agynd, agyn CLI, and Claude Code. | [agynio/agent-init-claude](https://github.com/agynio/agent-init-claude) |
| agent-init-agn | Init image bundling agynd, agyn CLI, and the agn CLI. | [agynio/agent-init-agn](https://github.com/agynio/agent-init-agn) |

## Schemas, deployment, automation

| Service | Description | Repository |
|---|---|---|
| API | Protobuf schemas for every service. | [agynio/api](https://github.com/agynio/api) |
| Terraform provider | Manages platform resources via Gateway. | [agynio/terraform-provider-agyn](https://github.com/agynio/terraform-provider-agyn) |
| Bootstrap | Install path — k3d + Terraform stacks. Used for both dev and production. | [agynio/bootstrap](https://github.com/agynio/bootstrap) |
| Service Helm charts | Per-service charts (one chart per platform service). Consumed by bootstrap today. | `ghcr.io/agynio/charts/<service>` |
| Platform Charts | Centralized umbrella chart, in preparation. Will replace per-service deployment in bootstrap once stable. | [agynio/platform-charts](https://github.com/agynio/platform-charts) |
| Demo Agent | Sample Terraform config that provisions a fleet of demo agents (support, marketing, data engineer). Useful as a starting point and as a copy-paste reference. | [agynio/demo-agent](https://github.com/agynio/demo-agent) |
| Architecture | Architecture and product documentation. | [agynio/architecture](https://github.com/agynio/architecture) |

## How to use this catalog

- **Looking for which service owns a resource?** Find the resource word (e.g. "thread") in the service rows above.
- **Debugging a request?** The Gateway is the first stop; the downstream service is wherever the request method's package points.
- **Filing a bug or feature request?** Open it on the matching repository's GitHub issue tracker.
- **Building an integration?** Most integrations talk to the [Gateway API](../build-extend/gateway-api.md); the catalog tells you which service backs each method.

## Related

- [Operate → Architecture overview](../operate/architecture.md) — how the services fit together.
- [Build & extend → Gateway API](../build-extend/gateway-api.md) — calling into the platform.
- [Reference → API contracts](./api.md) — the Protobuf schemas.
