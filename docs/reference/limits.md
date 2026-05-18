---
title: Limits and quotas
description: What's bounded on the platform and by how much.
order: 6
---

# Limits and quotas

Hard and soft limits enforced by the platform. Many are configurable in the Helm chart; defaults are listed here.

## File and message limits

| Limit | Value | Notes |
|---|---|---|
| Per-file upload size | 20 MB | Hard limit. Larger files require a custom MCP server that chunks content. |
| Per-message file attachments | 10 | Soft limit; configurable in `chat.maxAttachmentsPerMessage`. |
| Per-message body length | 64 KB | Limit on Markdown body; longer messages should attach as files. |

## Agent and workload limits

| Limit | Default | Notes |
|---|---|---|
| Agents per organization | Unlimited | Subject to resource quota. |
| MCP servers per agent | 32 | Soft limit; can be raised. |
| Skills per agent | 256 | Soft limit. |
| Hooks per agent | 32 | Soft limit. |
| ENV variables per resource | 64 | Practical Kubernetes ceiling. |
| ENV total size per container | 32 KB | Kubernetes hard limit. |
| Volumes per agent (including sub-resources) | 16 | Soft limit. |
| Volume size | 1 TB | Hard limit per volume. Configurable in `agents.maxVolumeSizeGb`. |
| Concurrent workloads per runner | Capped by runner resources | Not enforced by the platform. |
| Workload idle timeout | 5m default, 1m–24h range | Configurable per-agent. |

## API rate limits

| Limit | Default | Notes |
|---|---|---|
| Per-token Gateway requests | 600 / minute | Configurable in `gateway.rateLimit`. |
| Per-IP Gateway requests | 3000 / minute | Configurable in `gateway.rateLimit`. |
| `LLMProxy` per-token requests | Provider-dependent | LLM Proxy passes through provider rate limits; configure per-provider concurrency. |

## Authorization

| Limit | Value |
|---|---|
| Tuples per check | OpenFGA's per-store limit (very high) |
| Relations evaluated per `ListObjects` | Capped by OpenFGA's resolution depth (default 25) |
| Max tuples per Write | 100 |

## Tracing

| Limit | Default | Notes |
|---|---|---|
| Per-span size | 64 KB | Hard limit. Larger spans are rejected. |
| Spans per run | 10000 | Soft limit; runs exceeding this are truncated. |
| Run retention | 14 days | Configurable in `tracing.retentionDays`. |

## OpenZiti

| Limit | Notes |
|---|---|
| Identities per controller | OpenZiti-defined; depends on controller deployment. |
| Concurrent flows per identity | OpenZiti-defined; depends on routers. |

## Devices

| Limit | Value |
|---|---|
| Devices per user | Unlimited |
| JWT enrollment validity | 7 days (configurable per IdP setup) |

## API tokens

| Limit | Value |
|---|---|
| API tokens per user | Unlimited |
| Token TTL | Optional. Unlimited by default. |

## Apps

| Limit | Default | Notes |
|---|---|---|
| Apps published per organization | Unlimited | |
| Installations per app | Unlimited | |
| Audit log per installation | 1000 events | Ring buffer — oldest dropped. |

## Adjusting limits

Soft limits configurable in the chart `values.yaml` typically live under `<service>.limits.<name>`. Check the per-service README in `agynio/platform-charts` for the exact path.

Hard limits (file size, ENV total size) are platform-design choices and cannot be overridden — they reflect Kubernetes ceilings or platform-side guarantees we don't want to weaken.

## Related

- [Operate → Scaling](../operate/scaling.md)
- [Reference → Helm values](./helm-values.md)
