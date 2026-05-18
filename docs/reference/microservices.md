---
title: Microservices Catalog
description: Short descriptions of Agyn platform services and implementation repositories.
order: 2
---

# Microservices Catalog

Most platform services are deployed as Helm charts from GHCR and described in `agynio/architecture`.

| Service | Description | Repo |
| --- | --- | --- |
| Gateway | External ConnectRPC API entry point and app proxy surface. | `https://github.com/agynio/gateway` |
| Agents | Stores agent, MCP, skill, hook, ENV, volume, and image pull secret desired state. | `https://github.com/agynio/agents` |
| Agents Orchestrator | Reconciles thread activity into agent workload requests. | `https://github.com/agynio/agents-orchestrator` |
| Runners | Registry for runners and workload runtime state. | `https://github.com/agynio/runners` |
| k8s-runner | Default Kubernetes workload executor for agents and sidecars. | `https://github.com/agynio/k8s-runner` |
| Organizations | Organization lifecycle, membership, invites, and role assignment. | `https://github.com/agynio/organizations` |
| Identity | Central registry for users, agents, runners, and apps identities. | `https://github.com/agynio/identity` |
| Users | User records and profiles, including first-login provisioning. | `https://github.com/agynio/users` |
| Authorization | OpenFGA proxy for checks, writes, reads, and list operations. | `https://github.com/agynio/authorization` |
| Chat | Product chat experience built on Threads. | `https://github.com/agynio/chat` |
| Threads | Participant-agnostic conversations and message acknowledgment. | `https://github.com/agynio/threads` |
| Files | File metadata and pre-signed object access backed by S3-compatible storage. | `https://github.com/agynio/files` |
| files-mcp | Agent-facing MCP server for file content access. | `https://github.com/agynio/files-mcp` |
| LLM | LLM provider and model registry. | `https://github.com/agynio/llm` |
| LLM Proxy | OpenAI-compatible Responses API proxy for agents. | `https://github.com/agynio/llm-proxy` |
| Secrets | Secret providers, secret references, and runtime value resolution. | `https://github.com/agynio/secrets` |
| Notifications | Real-time event fanout through persistent connections. | `https://github.com/agynio/notifications` |
| Tracing | OTLP trace ingestion and query for agent and LLM observability. | `https://github.com/agynio/tracing` |
| Metering | Usage and cost-related activity tracking. | `https://github.com/agynio/metering` |
| Apps | App definitions, service tokens, installations, and app permissions. | `https://github.com/agynio/apps` |
| Ziti Management | OpenZiti service and identity management for private connectivity. | `https://github.com/agynio/ziti-management` |
| Console App | Browser UI for platform administration. | `https://github.com/agynio/console-app` |
| Chat App | Browser chat UI for end users. | `https://github.com/agynio/chat-app` |
| Tracing App | Browser UI for trace exploration. | `https://github.com/agynio/tracing-app` |
