---
title: Inspect Runs
description: Inspect agent workload behavior, traces, and tool activity.
order: 2
---

# Inspect Runs

Run inspection starts with the thread and follows the workload.

The Agents Orchestrator requests work, the runner executes it, and tracing captures spans and LLM context.

## Steps

1. Open the relevant thread or agent view.
2. Check whether a workload started and which runner handled it.
3. Review trace spans for model calls, tool calls, and errors.
4. Check MCP sidecar configuration when a tool fails.
5. Check LLM provider and model mapping when model calls fail.

## Expected outcome

You should identify whether a problem is in conversation state, agent configuration, runner scheduling, tool execution, or model routing.

For service boundaries, see [Service catalog](../reference/service-catalog.md).
