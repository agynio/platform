---
title: System Overview
description: Understand the major services and runtime flow in Agyn.
order: 1
---

# System Overview

Agyn groups configuration by organization and uses identities for users, agents, runners, and apps.

External clients use the Gateway for platform APIs.

Chat uses Threads for participant-agnostic conversations.

Agents, MCP sidecars, and hooks run as workloads through registered runners.

The Agents Orchestrator watches thread activity and asks a runner to start or update workloads.

Agents connect back to platform services through OpenZiti and use the LLM Proxy for model calls.

Files stores metadata and creates pre-signed object URLs; agents access file content through files MCP.

Notifications fan out state changes and Tracing captures OTLP spans.

For service-by-service details, see [Microservices catalog](../reference/service-catalog.md).
