---
title: Choose your path
description: Recommended reading order by role.
order: 4
---

# Choose your path

Different roles need different parts of these docs. Pick the path that matches what you are doing.

## I want to talk to agents in chat

You are an end user.

1. [What is Agyn](./what-is-agyn.md) — 2 minutes.
2. [Use → Chat](../use/chat.md) — start and manage conversations.
3. [Use → Files](../use/files.md) — attach files for agents to read.
4. [Use → Run Timeline](../use/run-timeline.md) — see what the agent did.
5. [Use → Reminders](../use/reminders.md) — let agents schedule follow-ups.

If your organization isn't set up yet, an admin needs to follow the [Administer](../administer/README.md) path first.

## I am setting up Agyn for my team

You are an organization admin. Assume Agyn is already installed on a cluster (or you are using Agyn Cloud).

1. [Concepts](./concepts.md) — skim the glossary.
2. [Administer → Console overview](../administer/console-overview.md) — orient yourself in the Console.
3. [Administer → Organizations](../administer/organizations.md) — create your organization, invite members.
4. [Administer → LLM providers](../administer/llm-providers.md) and [Models](../administer/models.md) — let agents call LLMs.
5. [Administer → Secrets](../administer/secrets.md) — set up credentials your agents need.
6. [Administer → Runners](../administer/runners.md) — pick where your agents run (or use a cluster-scoped runner).
7. [Administer → Agents](../administer/agents.md) — create your first agent.
8. Optional: [Administer → Apps](../administer/apps.md), [Administer → MCP servers](../administer/mcp-tools.md), [Administer → Terraform](../administer/terraform.md).

## I am installing Agyn on a Kubernetes cluster

You are a platform operator.

1. [What is Agyn](./what-is-agyn.md) and [Architecture at a glance](./architecture.md).
2. [Self-host install → Prerequisites](../self-host-install/prerequisites.md).
3. For dev/demo: [Self-host install → Quick bootstrap](../self-host-install/quick-bootstrap.md).
4. For production: [Self-host install → Production install](../self-host-install/production-install.md).
5. [Self-host install → First admin](../self-host-install/first-admin.md) — claim the cluster admin role.
6. [Operate → Architecture overview](../operate/architecture.md), [Networking](../operate/networking.md), [Identity](../operate/identity.md), [Authorization](../operate/authorization.md).
7. [Operate → Backup & DR](../operate/backup-disaster-recovery.md), [Upgrades](../operate/upgrades.md), [Security](../operate/security.md).

## I am building on the platform

You are a developer integrating with Agyn.

1. [Architecture at a glance](./architecture.md) and [Concepts](./concepts.md).
2. [Build & extend → Gateway API](../build-extend/gateway-api.md) — the external API surface.
3. [Build & extend → Terraform provider](../build-extend/terraform-provider.md) — manage resources as code.
4. [Build & extend → MCP servers](../build-extend/mcp-servers.md) — give agents new tools.
5. [Build & extend → Agent CLIs](../build-extend/agent-clis.md) — choose or build the agent loop.
6. [Build & extend → Apps](../build-extend/apps.md) — build services that participate in conversations.

## I need to debug something

1. [Troubleshooting](../troubleshooting/README.md) — diagnostic playbook by symptom.
2. [Use → Run Timeline](../use/run-timeline.md) — inspect what an agent actually did.
3. [Reference → Service catalog](../reference/service-catalog.md) — which service owns what.
