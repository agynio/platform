---
title: Control and Data Plane
description: Separate desired-state APIs from live request-path services.
order: 2
---

# Control and Data Plane

Agyn separates control-plane configuration from data-plane execution.

Control-plane services store desired state, membership, and resource definitions.

Examples include Agents, Runners, Organizations, Apps, and LLM model/provider configuration.

Data-plane services sit on live request paths.

Examples include Gateway, Chat, Threads, Files, LLM Proxy, Secrets, Authorization, Notifications, Tracing, and Ziti Management.

The runner is part of the execution plane: it creates and manages workload pods.

This separation keeps agent definitions stable while workloads can start, stop, or move between runners.

For deployment components, read [Helm charts](../deploy/helm-charts.md).
