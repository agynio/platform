---
title: Logging & audit
description: Where logs go, what's auditable, how to investigate.
order: 11
---

# Logging & audit

Every platform service emits structured JSON logs to stdout. Kubernetes (or your platform of choice) collects them; you ship them to your log store of choice.

This page covers what to expect in the logs, what gets audited explicitly, and how to use logs and traces together when investigating an incident.

## Log shape

Services use a common log envelope:

```json
{
  "ts": "2026-05-19T14:32:15.4Z",
  "service": "gateway",
  "level": "info",
  "method": "/agynio.api.agents.v1.AgentsGateway/CreateAgent",
  "identity_id": "f0c1e3...",
  "organization_id": "abc-123",
  "code": "OK",
  "duration_ms": 47,
  "msg": "rpc completed"
}
```

Standard fields:

- `service` — which service emitted the log.
- `level` — `debug`, `info`, `warn`, `error`.
- `ts` — RFC3339 timestamp.
- `msg` — short human-readable description.

Common fields when applicable:

- `identity_id` — the authenticated caller.
- `organization_id` — the org the request operates on.
- `method` — gRPC method or HTTP path.
- `code` — gRPC status code or HTTP status.
- `duration_ms` — how long the operation took.
- `trace_id`, `span_id` — when set, link logs to the platform's traces.

## Levels

- **debug** — verbose flow tracing. Usually off in production. Enable per-service via env var (`AGYND_LOG_LEVEL`, `GATEWAY_LOG_LEVEL`, etc.) for short windows.
- **info** — normal operations. Request/response summaries, lifecycle events.
- **warn** — recoverable issues. Retries, soft auth failures, slow operations.
- **error** — unhandled errors. Worth alerting on bursts.

Default level is `info`. Bumping to `debug` is fine for incident response but doubles log volume — turn it back down afterwards.

## Audit events

Privileged operations emit explicit audit events at `info` level with `audit=true`:

| Event | Emitted by |
|---|---|
| `audit.cluster_admin_granted` / `audit.cluster_admin_revoked` | Users service |
| `audit.organization_created` / `audit.organization_deleted` | Organizations service |
| `audit.agent_created` / `audit.agent_deleted` | Agents service |
| `audit.agent_availability_changed` | Agents service |
| `audit.role_granted` / `audit.role_revoked` | Various services (orgs, agents, apps) |
| `audit.secret_created` / `audit.secret_updated` / `audit.secret_deleted` | Secrets service |
| `audit.llm_provider_created` / `audit.llm_provider_updated` | LLM service |
| `audit.api_token_created` / `audit.api_token_revoked` | Users service |
| `audit.app_published` / `audit.app_uninstalled` | Apps service |
| `audit.cluster_runner_registered` / `audit.cluster_runner_deleted` | Runners service |

Filter on `audit=true` in your log pipeline to ship audit events to your SIEM. Retain them longer than operational logs (typically 1 year vs. 30 days).

## What's not logged

- **Secret values** — never. Resolution happens in-memory and is not logged.
- **API tokens** — only the prefix is logged. Full tokens never appear.
- **OIDC tokens** — only the resolved identity_id is logged.
- **LLM prompt contents** — not in operational logs. The Tracing service captures full LLM contexts; that data is in the Tracing database, not in service logs.
- **Message bodies** — Chat / Threads logs include thread IDs and message IDs but not bodies.

If you need message bodies for debugging, query the database directly with appropriate access controls.

## Investigation workflow

When something goes wrong:

1. **Find the request.** Start with the user's complaint — who, when, what they tried. In the Console, the user can show you the request URL and approximate time. The Tracing app's Run Timeline shows you the run end-to-end.
2. **Filter Gateway logs** by `identity_id` and time. Find the `code` and `duration_ms`.
3. **Follow the trace_id** from the Gateway log into the downstream service logs. Most queries cross 2-3 services.
4. **Check the Tracing app** for any agent run involved. The Run Timeline shows LLM contexts, tool inputs/outputs, and timing.
5. **Database state.** For data-shape questions ("why does this agent show 0 MCPs?"), query the service's database directly.

## Slow request investigation

```sh
# Find slow requests
kubectl logs -n agyn deploy/gateway --since=10m | \
  jq 'select(.duration_ms > 1000) | {ts, method, code, duration_ms, identity_id}'

# Follow a slow request into downstream services
TRACE_ID=$(... extract from above ...)
kubectl logs -n agyn -l app.kubernetes.io/component=platform --since=10m | \
  jq "select(.trace_id == \"$TRACE_ID\")"
```

Pair with traces from the Tracing service for the full picture.

## Log retention

Suggested defaults:

- Operational logs: 30 days hot, 90 days cold.
- Audit logs: 1 year minimum, longer if regulatory requirements apply.
- Traces: 7-30 days (Tracing's own retention setting).

Audit retention is usually driven by compliance — SOC 2, ISO 27001, HIPAA, GDPR. Check your obligations.

## Common log scenarios

### "Why was this user denied?"

Filter Gateway logs by `identity_id` and the affected method. Look for `code: "PERMISSION_DENIED"`. The Authorization service's logs include the failed check (`object`, `relation`, `user`) — search there for the same trace_id.

### "An agent is stuck"

1. Find the workload ID — Console → Activity → Workloads, or `agyn workloads list -o json`.
2. Filter Orchestrator logs by `workload_id` over the suspect time range.
3. Filter Runner logs the same way.
4. Inspect the workload's pod logs directly: `kubectl logs -n agyn-workloads <pod> -c <container>`.

### "We had a cluster admin grant we don't recognize"

Filter audit logs for `event="audit.cluster_admin_granted"` over the relevant time window. The actor, target, and timestamp are in the event payload.

## Related

- [Monitoring](./monitoring.md)
- [Security](./security.md)
- [Identity](./identity.md)
- [Use → Run Timeline](../use/run-timeline.md) — pair logs with traces.
