---
title: Agyn Documentation
description: Install, configure, use, and operate the Agyn AI agent platform.
order: 0
---

# Agyn Documentation

Agyn is a Kubernetes-native platform for running AI agents. Users talk to agents in a chat interface; admins configure agents, models, tools, and secrets in the Console; operators run the platform on their own clusters. Every agent run is fully observable — every LLM call, tool execution, and context decision is recorded and inspectable.

These docs are organized around what you are trying to do.

## Choose your path

| If you are… | Start with |
|---|---|
| **A user** talking to agents in chat | [Use Agyn](./use/README.md) |
| **An admin** configuring agents, models, secrets, runners, apps for your organization | [Administer](./administer/README.md) |
| **An operator** installing or running Agyn on your own Kubernetes cluster | [Self-host install](./self-host-install/README.md), then [Operate](./operate/README.md) |
| **A developer** integrating via API, Terraform, MCP, or building an app | [Build & extend](./build-extend/README.md) |
| **New to Agyn** | [Introduction](./introduction/README.md) |

## Sections

- **[Introduction](./introduction/README.md)** — what Agyn is, core concepts, architecture at a glance.
- **[Self-host install](./self-host-install/README.md)** — install Agyn on your own Kubernetes cluster with bootstrap (dev) or platform-charts (production). Skip this section if you use Agyn Cloud.
- **[Administer](./administer/README.md)** — configure your organization, agents, models, secrets, runners, tools, and apps. Console UI and Terraform side by side.
- **[Use](./use/README.md)** — everyday workflows: chat with agents, attach files, inspect runs, see usage, expose ports, manage API tokens.
- **[Build & extend](./build-extend/README.md)** — Gateway API, Terraform provider, MCP server authoring, agent CLI choice, apps development.
- **[Operate](./operate/README.md)** — day-2 operations: networking, identity, runners, scaling, backups, upgrades, security.
- **[Reference](./reference/README.md)** — glossary, service catalog, pointers to schemas and Helm values.
- **[Troubleshooting](./troubleshooting/README.md)** — diagnostic playbook by symptom and FAQ.

## How these docs work

Each configuration topic follows the same pattern: a short concept block, **Configure in the Console** with screenshots and real route paths, **Configure with Terraform** with a working HCL snippet, and a related-links list. You can adopt either path — what the Console builds, Terraform can manage too.
