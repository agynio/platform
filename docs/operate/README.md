---
title: Operate
description: Day-2 operations for self-hosted Agyn.
order: 6
---

# Operate

This section is for platform operators running Agyn on their own Kubernetes. It assumes you've already installed Agyn — see [Self-host install](../self-host-install/README.md) for first deployment.

The pages here cover what happens after install: the system architecture in detail, networking, identity and authorization, runner operations, scaling, backups, upgrades, monitoring, security, and logging.

## When to read what

| If you need to… | Read |
|---|---|
| Understand how services fit together | [Architecture overview](./architecture.md) |
| Configure DNS, ingress, or OpenZiti | [Networking](./networking.md) |
| Set up OIDC or troubleshoot sign-in | [Identity](./identity.md) |
| Understand who can do what | [Authorization](./authorization.md) |
| Add capacity or move workloads | [Runners](./runners.md), [Scaling](./scaling.md) |
| Survive a database loss | [Backup & DR](./backup-disaster-recovery.md) |
| Roll out a new version | [Upgrades](./upgrades.md) |
| Watch the platform's health | [Monitoring](./monitoring.md) |
| Harden production | [Security](./security.md) |
| Find what happened | [Logging & audit](./logging-audit.md) |

## Pages

- [Architecture overview](./architecture.md) — every service, every store, how data flows.
- [Networking](./networking.md) — OpenZiti, Istio, DNS, ingress, TLS.
- [Identity](./identity.md) — OIDC integration, user provisioning, devices.
- [Authorization](./authorization.md) — OpenFGA, the ReBAC model, common queries.
- [Runners](./runners.md) — deploying, registering, sizing, observing runners.
- [Scaling](./scaling.md) — how to grow each part of the platform.
- [Backup & disaster recovery](./backup-disaster-recovery.md) — Postgres, OpenFGA, S3, volumes.
- [Upgrades](./upgrades.md) — deeper than the install-section upgrade page.
- [Monitoring](./monitoring.md) — platform metrics, health checks, alerts.
- [Security](./security.md) — hardening, key rotation, network policies.
- [Logging & audit](./logging-audit.md) — where logs go, what's auditable.
