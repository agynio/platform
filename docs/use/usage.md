---
title: Usage
description: Track tokens, compute, storage, and platform activity.
order: 8
---

# Usage

The Usage view shows resource consumption for your organization — LLM tokens, compute hours, storage, and platform activity (threads created, messages sent). It is read-only and reflects the state at page load.

## Open Usage

Console → **Activity → Usage** (`/organizations/<org>/activity/usage`).

The view is a single scrollable page with four sections — LLM, Compute, Storage, Platform — and a time range selector at the top.


## Time range

| Range | Bucket size |
|---|---|
| Last 24h | 5-minute buckets |
| Last 7d | 1-hour buckets |
| Last 30d | 6-hour buckets |
| Custom | Bucket auto-picked to keep charts legible |

Usage is not live — to refresh, change the time range or reload the page.

## LLM

The most-watched section. Summary cards:

- **Input tokens** — sum of prompt tokens across all LLM calls.
- **Cached tokens** — `<cached> of <input>`. Provider-side prompt cache reuse, when supported by the model.
- **Output tokens** — what the model generated.
- **Successful requests** / **Failed requests** — counts.

Charts:

- **Tokens over time** — stacked bars: cached + fresh input vs. output, per bucket.
- **Top consumers** — horizontal bars by consuming identity (which agent or user drove the calls).
- **By model** — horizontal bars by model.

Cache efficiency is a leading indicator of cost — high cached-token ratios mean you are not paying full price for the prompt every call.

## Compute

CPU and RAM consumed by agent workloads, in core-hours and GB-hours.

- **Summary cards** — CPU-core-hours, RAM-GB-hours over the selected range.
- **Usage over time** — bars showing CPU and RAM per bucket.
- **Top agents** — horizontal bars by agent.

Compute is **allocation-based**, not actual utilization. The platform records what each workload reserved, not what it actually used. This is the durable signal — it does not depend on metrics scraping inside the workload.

## Storage

Persistent volume storage in GB-hours.

- **Summary card** — Storage-GB-hours.
- **Usage over time** — bar per bucket.
- **Top agents** — horizontal bars by agent.

Like compute, storage is allocation-based — the size of the provisioned PVC times its lifetime.

## Platform activity

Threads and messages — the lightest section, useful for capacity planning.

- **Summary cards** — Threads created, Messages sent.
- **Activity over time** — side-by-side bars.

## What's missing

The Usage view focuses on aggregates. For per-run inspection, use the [Run Timeline](./run-timeline.md). For provider-side billing, use your provider's invoice — the platform's token counts are accurate but the dollar figures depend on your provider's pricing.

## Cluster admins

Cluster admins see one Usage view per organization (Console → org → Usage). There is no cross-org aggregate in the Console; query the Metering service directly for that.

## Related

- [Administer → Monitoring](../administer/monitoring.md) — full set of operator-facing dashboards.
- [Run Timeline](./run-timeline.md) — per-run token usage.
- [Operate → Monitoring](../operate/monitoring.md) — platform-side metrics.
