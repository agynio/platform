---
title: Tracing gaps
description: Spans missing, run timeline empty.
order: 7
---

# Tracing gaps

The Tracing service captures spans emitted by agents and platform services. If the Run Timeline looks incomplete or empty, the issue is usually in the agent → Tracing pipeline.

## Run Timeline is completely empty

Two possibilities: the run never happened, or the spans never reached Tracing.

- **Did the agent start?** Check Activity → Workloads for the conversation. If there is no workload, the orchestrator never started a run — likely an authorization or scheduling issue (see [Agents won't start](./agents.md)).
- **Spans not reaching Tracing.** `agynd` runs an OTLP proxy on `localhost:4317` and forwards spans to Tracing over `tracing.ziti`. If either side breaks, the timeline is empty.
  - Check `agynd`'s logs for tracing errors.
  - Check the Ziti sidecar can resolve `tracing.ziti`.
  - Check the Tracing service's ingest metrics.

## Some events missing

If you see message and LLM events but no tool events (or vice versa):

- **Agent CLI doesn't emit spans for that event type.** Codex and Claude Code emit different span sets. Confirm by checking what your CLI produces in a local OTLP setup.
- **Sampling.** If you've enabled sampling, some events legitimately don't make it.

## LLM context missing or truncated

LLM Call event detail shows "context unavailable" or similar:

- **Span body too large.** Tracing's per-span limit is 64 KB. Spans larger than that are rejected. If your prompt is enormous, you'll lose the full context.
- **Span ingest queue full.** Under heavy load, Tracing drops oldest pending spans. Increase ingest workers or scale up the Tracing writer.

## Tool output missing

The Tool Execution event shows status but no terminal output:

- **Tool produced no stdout/stderr.** Some tools (especially HTTP-only tools) don't write to the terminal. The structured input/output is the source of truth in those cases.
- **Terminal output streaming dropped chunks.** Under high throughput, the platform may drop chunks. The Run Timeline notes this with a "chunks dropped" indicator.

## Run shows `terminated` but I didn't terminate it

Termination can come from:

- **The user.** Someone clicked **Terminate** in the Run Timeline.
- **The orchestrator.** Idle timeout reached.
- **`agynd`.** The agent CLI exited cleanly (which the orchestrator interprets as completion, not termination — distinct status).
- **A failure mid-run.** The CLI crashed or the workload died.

The Run Timeline's top bar shows the reason. If it says "terminated by user," check who has access to the conversation.

## Trace shows wrong agent or organization

Tracing derives the `agent_id` and `organization_id` from the OpenZiti identity that emitted the span (resolved via the Agents service's internal `ResolveAgentIdentity` RPC).

- **Wrong identity.** Should be impossible — every span is identity-checked at ingest. If you see this, file a bug.
- **Newly recycled identity.** Agent identities rotate per workload start. The first few spans of a fresh workload should be attributed to the right agent.

## Tracing app shows no runs at all

You're looking at the organization page but the runs list is empty:

- **No runs in the time window.** Tracing retention is configurable (default 14 days). Older runs may have aged out.
- **Permissions.** You don't have `can_view_workloads` on the organization. Cluster admins and org owners do by default.
- **Tracing database empty.** Check the Tracing service's `spans` table — if empty, ingest isn't happening.

## Spans for a specific service are missing

Platform services emit their own traces alongside agent traces. If a service's spans are missing:

- The service has tracing disabled. Most platform services emit by default; some require `TRACING_ENABLED=true` in their env.
- The service's traces are filtered out in your trace viewer. Check the `service.name` filter.

## Tracing performance is slow

Symptom: the Run Timeline takes seconds to load, queries time out.

- **Database hot.** Tracing's PostgreSQL is the highest-write service. Check Postgres CPU and disk IO.
- **Long retention with high run volume.** Shorter retention helps.
- **Query without indexes.** If you query Tracing directly, use indexed columns (`workload_id`, `thread_id`, time range).

## Related

- [Use → Run Timeline](../use/run-timeline.md)
- [Use → Tracing app](../use/tracing-app.md)
- [Operate → Architecture overview](../operate/architecture.md)
- [Operate → Scaling](../operate/scaling.md)
