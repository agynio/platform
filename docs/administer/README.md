---
title: Administer
description: Configure your organization, agents, models, secrets, runners, tools, and apps.
order: 3
---

# Administer

This section is for organization owners and cluster admins. Every page covers a configuration topic with three blocks: a short concept explanation, **Configure in the Console** with screenshots and real route paths, and **Configure with Terraform** with a working snippet.

## Where to start

If you are new to the Console, read these in order:

1. [Console overview](./console-overview.md) — get oriented in the UI.
2. [Organizations](./organizations.md) — create your org (cloud) or claim it (self-host).
3. [Members](./members.md) — invite teammates.
4. [LLM providers](./llm-providers.md) and [Models](./models.md) — give agents access to LLMs.
5. [Secrets](./secrets.md) — set up credentials for tools and providers.
6. [Runners](./runners.md) — pick where your agents run.
7. [Agents](./agents.md) — create your first agent.

## All pages

### Console & access

- [Console overview](./console-overview.md) — roles, layout, navigation.
- [Cluster administration](./cluster-administration.md) — platform users, cluster-scoped runners, all organizations.

### Organization

- [Organizations](./organizations.md) — create, settings, lifecycle.
- [Members](./members.md) — invite users, assign roles.

### Agents and their sub-resources

- [Agents](./agents.md) — agent resource, model, image, availability, idle timeout, compute.
- [Agent roles](./agent-roles.md) — per-agent owner, maintainer, participant grants.
- [MCP servers](./mcp-servers.md) — tools agents can call.
- [Skills](./skills.md) — reusable prompt fragments.
- [Hooks](./hooks.md) — event-driven sidecars.
- [Environment variables](./environment-variables.md) — plain values and secret references.
- [Init scripts](./init-scripts.md) — pre-start setup.
- [Volumes](./volumes.md) — persistent disks for agents.

### LLMs

- [LLM providers](./llm-providers.md) — connect to OpenAI, Anthropic, or a self-hosted endpoint.
- [Models](./models.md) — map platform model names to providers.

### Secrets

- [Secret providers](./secret-providers.md) — Vault and other external stores.
- [Secrets](./secrets.md) — values stored locally or referenced remotely.
- [Image pull secrets](./image-pull-secrets.md) — private registry credentials.

### Runtime

- [Runners](./runners.md) — register where workloads run.
- [Monitoring](./monitoring.md) — live workload, storage, threads, and usage views.

### Apps

- [Apps](./apps.md) — install and configure apps from the marketplace or your org.
- [Reminders app](./reminders-app.md) — let agents schedule follow-ups.
- [Telegram Connector](./telegram-connector.md) — bridge Telegram chats to Agyn conversations.

### Automation

- [Terraform](./terraform.md) — manage all the above as code with the `agyn` Terraform provider.
