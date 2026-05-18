---
title: Versions and support matrix
description: What runs with what.
order: 7
---

# Versions and support matrix

The platform ships as a coordinated set of services. Use this table to verify that the dependencies in your environment meet the platform's expectations.

## External dependencies

| Component | Minimum | Recommended | Notes |
|---|---|---|---|
| Kubernetes | 1.27 | 1.29+ | Tested on EKS, GKE, AKS, k3d (bootstrap). |
| Istio | 1.20 | 1.22+ | `STRICT` mTLS required. |
| OpenZiti | 0.30 | 1.0+ | Controller + at least one router. |
| OpenFGA | 1.5 | 1.6+ | PostgreSQL backend. |
| PostgreSQL | 14 | 16 | One cluster, multiple databases. |
| Redis | 6 | 7 | Pub/sub. |
| cert-manager | 1.13 | 1.15+ | For TLS automation. |
| Helm | 3.13 | 3.14+ | |
| Terraform (for installs) | 1.6 | 1.7+ | |
| `agyn` CLI | matches chart minor | matches chart minor | |
| Terraform provider | matches chart minor | matches chart minor | |

## Inter-service compatibility

Within a chart release, all platform services are pinned to compatible versions. You should not mix-and-match service versions outside what the chart specifies.

| Surface | Compatibility window |
|---|---|
| Gateway API (external) | One minor version. A v1.3.x client works with v1.3.x and v1.4.x Gateway. |
| Internal RPCs | Pinned per release. Inter-service RPCs are not stable across minor versions. |
| Authorization model | Pinned per release. Model migrations run as part of `helm upgrade`. |
| Terraform provider | One minor version. v1.3.x provider works with v1.3.x and v1.4.x platform. |
| `agyn` CLI | One minor version. |
| Runners (k8s-runner) | One minor version. The runner protocol is stable within a window. |
| Apps (Reminders, Telegram Connector, custom) | One minor version. Apps may need upgrades for major releases. |

Mixing service versions outside the pinned set is unsupported. The chart upgrade mechanism handles compatibility automatically.

## Agent CLI compatibility

The `agent-init-*` images are versioned independently. As long as they bundle a compatible `agynd`, they work across platform versions.

| Init image | Bundled `agynd` minimum |
|---|---|
| `agent-init-codex:v1.x` | `agynd v1.x` |
| `agent-init-claude:v1.x` | `agynd v1.x` |
| `agent-init-agn:v1.x` | `agynd v1.x` |

`agynd` versions newer than the platform's chart version are OK — `agynd` is backward-compatible with at least one minor version of platform Gateway.

## Browser support

The Console, Chat, and Tracing apps support:

- **Chrome** / Chromium-based (Edge, Brave, Arc): last 2 major versions.
- **Firefox**: last 2 major versions.
- **Safari**: last 2 major versions.

WebSocket and Service Workers are required. Mobile browsers (mobile Safari, mobile Chrome) work but are not the primary tested target.

## Provider matrix

LLM providers exposed through LLM Proxy:

| Provider | Protocol | Status |
|---|---|---|
| OpenAI | `responses` | Supported. |
| Azure OpenAI | `responses` | Supported. |
| Anthropic | `anthropic_messages` | Supported. |
| OpenAI-compatible self-hosted (vLLM, TGI with adapter) | `responses` | Supported. |
| Anthropic-compatible self-hosted | `anthropic_messages` | Supported. |

Adding a new provider protocol means a change to LLM Proxy; reach out via GitHub if you need one.

## EOL

The platform is in pre-1.0 development. Once we reach 1.0:

- Minor versions get patch support for 12 months.
- Major versions get patch support for 18 months from the next major's release.

Pre-1.0 versions are supported on a best-effort basis. We encourage upgrading on each release.

## Related

- [Self-host install → Upgrades](../self-host-install/upgrades.md)
- [Operate → Upgrades](../operate/upgrades.md)
- [Reference → Helm values](./helm-values.md)
