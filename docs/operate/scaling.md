---
title: Scaling
description: How to grow each part of the platform.
order: 6
---

# Scaling

Agyn's services scale independently. Each has different bottlenecks. This page covers what to scale when.

## Capacity model

| Resource | What grows it | Where it shows up |
|---|---|---|
| Concurrent agent workloads | Number of active conversations | Runner cluster CPU/memory. |
| Messages/sec | User and agent activity | Threads + Notifications + Tracing throughput. |
| LLM call throughput | Agent verbosity, model choice | LLM Proxy concurrency, provider rate limits. |
| Trace volume | Number and length of runs | Tracing PostgreSQL disk + write throughput. |
| Persistent volume usage | Number of volumes × size × thread count | Runner cluster storage. |

## Stateless services

Almost every platform service is stateless and horizontally scalable:

- Gateway
- Chat
- LLM Proxy
- Notifications (per-replica; pub/sub state in Redis)
- Tracing (writer scaled with WAL throughput; queryable from replicas)
- Authorization (proxy in front of OpenFGA — OpenFGA is the bottleneck)
- Identity, Users, Organizations, Apps, Files, Media Proxy, Token Counting, Metering, Secrets, LLM, Ziti Management

Scale with HPA based on CPU/memory or your own metrics. The platform charts include sample HPA values commented out.

## Stateful pieces

### PostgreSQL

The biggest scaling concern. Per-service databases lets you scale them independently — but most deployments start with one Postgres cluster with multiple databases.

Hot tables:

- `tracing.spans` — high write rate. Consider partitioning by time and using a separate Postgres instance once it dominates.
- `threads.messages` — moderate write rate.
- `metering.records` — moderate write rate, month-partitioned.

Vertical scale first (add CPU/RAM, faster disks). Horizontal scale via read replicas for Tracing query traffic; the writer stays single-instance.

### OpenFGA

OpenFGA is its own Postgres database. Tuples grow with the number of agents, threads, and identities. Most queries are sub-millisecond; the database is rarely the bottleneck.

If OpenFGA becomes the bottleneck:

- Add read replicas. OpenFGA supports read-only replicas for `Check` and `ListObjects`.
- Increase PostgreSQL connection pool size on OpenFGA.

### Redis

Notifications uses Redis pub/sub. Pub/sub doesn't scale by sharding — every subscriber sees every event for its room. For very large deployments, consider Redis Cluster with consistent hashing on room IDs.

### S3

Effectively unlimited. Watch your provider's rate limits if you have very high upload volume.

### Runners

See [Runners → Sizing](./runners.md#sizing).

## Singleton services

A few services are single-leader:

- **Agents Orchestrator** uses Kubernetes Lease for leader election. Run multiple replicas for failover — only one is active at a time.
- **Per-app reconcilers** in some apps are leader-elected the same way.

This is intentional — these services maintain reconciliation state in memory and cannot safely partition the work.

## LLM Proxy

LLM Proxy is stateless but throughput-sensitive. Provider rate limits often bind before the proxy itself does:

- Watch HTTP 429 responses from providers.
- Configure per-provider concurrency limits in LLM Proxy (`llm_proxy.providers.<name>.maxConcurrency`).
- For very high throughput, register multiple LLM providers pointing at the same backend (e.g. two Azure deployments) and split agents across them.

## Tracing throughput

Tracing is a write-heavy service. Two scaling levers:

- **Sampling**: agents can be configured to sample spans (currently all spans are sent — head-based sampling is a planned feature).
- **Retention**: shorter retention reduces disk usage and improves query speed. Configure via `tracing.retentionDays` in the platform chart.

For very high trace volume, consider running Tracing's PostgreSQL on dedicated hardware separate from the platform's main database.

## Notifications

Each socket connection holds a goroutine and Redis subscriber on the Notifications replica it landed on. With many concurrent UI sessions:

- Scale Notifications replicas horizontally.
- Use a load balancer with sticky sessions (the Console and Chat apps support reconnect on socket drop).
- Watch Redis client count — high session counts can saturate Redis client connections.

## File serving

Files themselves go through S3 → Media Proxy → browser. Media Proxy is stateless and can scale horizontally. The bottleneck is usually upstream — S3 GET cost, S3 throughput, or proxy CPU for image downsampling.

For media-heavy deployments, enable a CDN in front of Media Proxy (your CDN must handle the authenticated requests Media Proxy proxies).

## Pod density

The platform expects:

- One Pod per service deployment by default; scale up via Deployment replicas.
- Agent workload Pods land in `agyn-workloads` (or wherever you configure the runner).
- Each agent Pod has 1 runtime container + N MCP sidecars + (optional) hook sidecars + Ziti sidecar. Plan accordingly.

A typical 8-vCPU / 32 GiB runner node handles ~30-50 concurrent simple agents, far fewer if agents use heavy MCPs or many sidecars.

## Related

- [Architecture overview](./architecture.md)
- [Runners](./runners.md)
- [Monitoring](./monitoring.md)
- [Backup & DR](./backup-disaster-recovery.md)
