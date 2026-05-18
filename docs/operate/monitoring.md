---
title: Monitoring
description: Platform metrics, health checks, alerts.
order: 9
---

# Monitoring

The platform exposes operational metrics independently of the customer-facing Activity/Usage views. This page covers what to scrape, what to alert on, and where to look when something looks off.

For the customer-facing operator view (workloads, threads, usage in the Console), see [Administer → Monitoring](../administer/monitoring.md).

## Metrics

Every platform service exposes Prometheus metrics on `:8080/metrics` (or the port set in the chart). Standard sets:

- **gRPC server metrics** — request rate, error rate, latency by method (via the `go-grpc-prometheus` middleware most services use).
- **HTTP server metrics** — Gateway and LLM Proxy expose RED metrics.
- **DB metrics** — open connections, idle connections, query latency.
- **Custom service metrics** — see each service's metrics page in its repo.

The platform charts include `ServiceMonitor` resources for Prometheus Operator. With kube-prometheus-stack installed:

```sh
helm upgrade agyn-platform agyn/platform \
  -n agyn \
  --set monitoring.serviceMonitor.enabled=true
```

Metrics start showing up in Prometheus within a few scrape intervals.

## Health checks

Each service exposes:

- `/healthz` — liveness. Returns 200 if the process is up.
- `/readyz` — readiness. Returns 200 only when DB connections and dependent services are reachable.

Kubernetes uses both for pod health.

## Suggested alerts

| Alert | Trigger | What it usually means |
|---|---|---|
| **Gateway error rate > 1%** | `gateway_grpc_server_handled_total{code!="OK"}` over 5m | Service downstream is failing or an authz bug landed. |
| **Orchestrator no recent reconciliation** | `orchestrator_reconcile_last_success_timestamp` older than 60s | Orchestrator stuck. Check leader election. |
| **Workload start failure rate > 5%** | `workload_failures_total{reason=~"start_failed|config_invalid"}` | Image pulls failing, agent CLI mis-configured, runner unhealthy. |
| **Tracing ingest queue depth** | `tracing_ingest_queue_depth > 10000` | Tracing writer can't keep up. |
| **Authorization check p95 > 100ms** | `authorization_check_latency_seconds_bucket` | OpenFGA database hot. |
| **Postgres connection saturation > 80%** | per-service DB metrics | Increase pool, add connection pooling (pgBouncer). |
| **LLM Proxy 429 rate > 1%** | `llm_proxy_upstream_status_code{status="429"}` | Provider rate-limited. Adjust per-provider concurrency. |
| **Notifications subscriber count cliff** | `notifications_active_subscribers` drops sharply | UI fleet disconnected. Check ingress. |
| **OpenZiti router down** | OpenZiti's own metrics | Workloads can't reach Gateway / LLM Proxy. |

These are starting points — tune to your environment.

## Dashboards

The platform charts ship Grafana dashboards under `charts/platform/grafana/`. Import them into your Grafana:

- **Platform overview** — request rate / error rate per service.
- **Agent workloads** — concurrent workloads, start failures, idle-timeout rate, per-runner distribution.
- **LLM usage** — token rate, cache hit rate, per-model error rate.
- **Tracing throughput** — spans/sec, queue depth, DB write latency.
- **OpenFGA** — check rate, ListObjects rate, tuple growth.

## Log aggregation

Send service logs to your central log store (Elasticsearch, Loki, CloudWatch, Splunk). Each service emits structured JSON logs with at minimum:

- `service`
- `level`
- `time`
- `msg`
- `identity_id` (when authenticated)
- `method` / `path`
- `code` / `status`

For privileged decisions (cluster admin grants, deletions, configuration changes), services emit dedicated audit events. See [Logging & audit](./logging-audit.md).

## Tracing the platform itself

The platform's own internal traces are emitted alongside agent traces. Filter by `service.name=<platform-service>` in your trace explorer. This is useful for debugging Gateway-to-service latency, slow OpenFGA checks, or stuck reconciliation loops.

## Capacity tracking

Track these over time to predict scaling needs:

- **Concurrent agent workloads** — drives runner sizing.
- **Daily LLM token spend** — drives provider quota and budget.
- **Database size growth** — Tracing and Threads grow fastest.
- **Per-organization growth** — number of orgs, users per org, agents per org.

A monthly capacity review against these numbers catches problems before they bite.

## SLOs

Reasonable starting targets:

| SLO | Target |
|---|---|
| Gateway request availability | 99.9% |
| Workload start success rate | 99% |
| Chat message round-trip (user → agent reply) p95 | < 30s (model-dependent) |
| Tracing ingest delay | < 5s |
| Console page load p95 | < 2s |

Track these via Prometheus rules and review monthly.

## Related

- [Architecture overview](./architecture.md)
- [Scaling](./scaling.md)
- [Logging & audit](./logging-audit.md)
- [Administer → Monitoring](../administer/monitoring.md) — customer-facing view.
