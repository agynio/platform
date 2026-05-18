---
title: Observe Workloads
description: Inspect traces, workload state, usage, and runtime signals.
order: 3
---

# Observe Workloads

Agyn separates desired state from runtime state.

The Agents service stores agent configuration, while Runners track registered executors and running workloads.

The Agents Orchestrator reconciles thread activity into workload requests and sends them to an eligible runner.

Tracing ingests OTLP spans and captures LLM call context for observability.

Notifications fan out state changes to product surfaces over persistent connections.

Metering tracks usage so teams can understand agent cost and activity.

When debugging, check the agent resource, runner registration, workload state, tool sidecars, and traces in that order.

For common checks, see [Troubleshooting](../help/troubleshooting.md).
