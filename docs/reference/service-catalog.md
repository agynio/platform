---
title: Microservices Catalog
description: Customer-facing catalog of Agyn services, apps, and implementation repositories.
order: 2
---

# Microservices Catalog

Agyn is composed of API schemas, platform services, apps, CLIs, runtime images, runners, and deployment tooling.

The catalog below follows `agynio/architecture` system overview, API contracts, and related service pages.

## Core platform services

| Service | Description | Repo |
| --- | --- | --- |
| Gateway | External ConnectRPC API entry point for platform clients. It exposes curated Gateway APIs and routes app proxy traffic through the public platform surface. | `https://github.com/agynio/gateway` |
| Agents | Stores desired state for agents, volumes, MCPs, skills, hooks, ENVs, init scripts, and image pull secret attachments. Operators configure what should run here; orchestrators and runners reconcile runtime state elsewhere. | `https://github.com/agynio/agents` |
| Agents Orchestrator | Watches thread activity and agent configuration, then requests workloads from eligible runners. It is the bridge between conversation state and runtime execution. | `https://github.com/agynio/agents-orchestrator` |
| Runners | Registers cluster-scoped and organization-scoped runners, labels, capabilities, identities, service tokens, and workload runtime state. It lets Agyn route work to the right execution capacity. | `https://github.com/agynio/runners` |
| Organizations | Manages organizations, membership, invites, direct membership, role assignment, and organization discovery. Organizations are the primary scope for agents, models, secrets, threads, and apps. | `https://github.com/agynio/organizations` |
| Identity | Central identity registry for users, agents, runners, and apps. Services use identity IDs consistently while identity type remains tracked centrally. | `https://github.com/agynio/identity` |
| Users | Provisions users on first OIDC login and serves user profile records for display. Product surfaces use it for human identity data. | `https://github.com/agynio/users` |
| Authorization | Thin service proxy in front of OpenFGA for checks, tuple writes, reads, and list operations. It centralizes OpenFGA configuration and keeps all services on one authorization interface. | `https://github.com/agynio/authorization` |
| Chat | Built-in web and mobile chat domain for thread lifecycle, topic, unread counts, and chat-specific product behavior. It is built on top of the generic Threads service. | `https://github.com/agynio/chat` |
| Threads | Participant-agnostic conversation storage with messages, participants, and acknowledgments. Agents, users, and apps all participate through identity IDs. | `https://github.com/agynio/threads` |
| Files | Handles upload, file metadata, and pre-signed object access backed by S3-compatible storage. Threads store file IDs while agents fetch content lazily through files MCP. | `https://github.com/agynio/files` |
| LLM | Manages LLM providers and model mappings. It resolves an Agyn model name to provider endpoint, token, protocol, and remote model name. | `https://github.com/agynio/llm` |
| LLM Proxy | OpenAI-compatible Responses API endpoint used by agents. It authenticates callers, resolves models through the LLM service, and forwards requests to upstream model providers. | `https://github.com/agynio/llm-proxy` |
| Secrets | Manages secret providers and secret references, including runtime resolution from external systems such as Vault. Agents and tool sidecars use this to avoid putting credentials in prompts. | `https://github.com/agynio/secrets` |
| Notifications | Real-time event fanout service for state changes across the platform. Product UIs use it to receive updates over persistent connections. | `https://github.com/agynio/notifications` |
| Tracing | OTLP trace ingestion and query service for agent, tool, and LLM observability. It captures LLM call context and supports debugging in the tracing app. | `https://github.com/agynio/tracing` |
| Metering | Tracks usage and cost-related activity for agents and model calls. It supports customer-facing visibility into consumption and operational reporting. | `https://github.com/agynio/metering` |
| Expose | Manages port and service exposure for workloads that need reachable endpoints. It lets platform-controlled routing expose selected internal services safely. | `https://github.com/agynio/expose` |
| Media Proxy | Serves media bytes through authenticated, platform-aware routes. It keeps browser and app access to uploaded files behind platform authorization. | `https://github.com/agynio/media-proxy` |
| Token Counting | Calculates model token usage with provider-accurate tokenization. Metering and cost views use it to report usage consistently. | `https://github.com/agynio/token-counting` |
| Ziti Management | Manages OpenZiti identities, services, and policies for private connectivity. Agents and apps use Ziti paths to reach Gateway and LLM Proxy without broad network exposure. | `https://github.com/agynio/ziti-management` |
| Apps Service | Manages app definitions, installations, service tokens, profiles, enrollment, and app permission bridges. It lets external and platform apps participate in organizations and threads. | `https://github.com/agynio/apps` |

## Apps and user-facing surfaces

| Service | Description | Repo |
| --- | --- | --- |
| Console App | Browser management UI for organizations, agents, configuration, and operations. It is the main administrative product surface. | `https://github.com/agynio/console-app` |
| Chat App | Browser chat UI for end users talking with agents and other participants. It consumes Chat, Threads, Files, Notifications, and Gateway APIs. | `https://github.com/agynio/chat-app` |
| Tracing App | Browser trace exploration UI for reviewing spans and LLM context. Operators use it to debug workload and model behavior. | `https://github.com/agynio/tracing-app` |
| Reminders | Platform app that participates in threads to provide reminder capabilities. It is installed through the Apps service and communicates through Gateway over Ziti. | `https://github.com/agynio/reminders` |
| Telegram Connector | App bridge between Telegram and Agyn threads. It receives Telegram events, maps them into platform conversations, and sends replies back to Telegram. | `https://github.com/agynio/telegram-connector` |

## Agent runtime and tools

| Service | Description | Repo |
| --- | --- | --- |
| k8s-runner | Default Kubernetes-native runner implementation. It creates and manages agent pods, sidecars, volumes, and workload lifecycle in Kubernetes. | `https://github.com/agynio/k8s-runner` |
| agynd CLI | Agent wrapper daemon injected into workloads by the init container. It bridges agent CLIs with platform threads, files, tools, and LLM calls. | `https://github.com/agynio/agynd-cli` |
| agyn CLI | Platform CLI available inside agent workloads. Agents can use it to call platform capabilities through the Gateway API. | `https://github.com/agynio/agyn-cli` |
| agn CLI | Agyn-native agent loop implementation for LLM reasoning with tool use. It is one supported agent CLI type behind `agynd`. | `https://github.com/agynio/agn-cli` |
| files-mcp | MCP server that lets agents read platform file content on demand. It resolves `agyn://file/...` references through Gateway and Files. | `https://github.com/agynio/files-mcp` |
| codex-sdk-go | Go SDK integration for driving Codex CLI from `agynd`. It encapsulates process management and protocol handling for Codex-based agents. | `https://github.com/agynio/codex-sdk-go` |
| agent-init-codex | Init image containing `agynd`, Agyn CLI, Codex CLI, and runtime config for Codex agents. It copies binaries into the shared `/agyn-bin` volume. | `https://github.com/agynio/agent-init-codex` |
| agent-init-claude | Init image containing `agynd`, Agyn CLI, Claude Code CLI, and runtime config for Claude agents. It keeps the user dev container image unchanged. | `https://github.com/agynio/agent-init-claude` |
| agent-init-agn | Init image containing `agynd`, Agyn CLI, agn CLI, and runtime config for Agyn-native agents. It follows the same shared volume contract as other init images. | `https://github.com/agynio/agent-init-agn` |

## Schemas, deployment, and operations

| Service | Description | Repo |
| --- | --- | --- |
| API | Protobuf schemas for internal gRPC services and external Gateway ConnectRPC services. It is the contract source for generated clients and service interfaces. | `https://github.com/agynio/api` |
| Terraform Provider | Terraform provider for managing Agyn organizations, agents, MCPs, providers, models, secrets, runners, and related resources through Gateway. | `https://github.com/agynio/terraform-provider-agyn` |
| Bootstrap | Reference Terraform deployment for local and development environments. It provisions Kubernetes, system namespaces, routing, data services, platform services, apps, and Ziti. | `https://github.com/agynio/bootstrap` |
| Platform Charts | Helm umbrella charts for core platform services and apps plus the default runner. Production installs use these charts with pre-created database, S3, app token, and runner token Secrets. | `https://github.com/agynio/platform-charts` |
| Architecture | Product, service, and architecture documentation used as the source of truth for service boundaries and design decisions. | `https://github.com/agynio/architecture` |
