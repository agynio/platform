---
title: Deploy
description: Deploy Agyn with bootstrap Terraform or Helm charts.
order: 4
---

# Deploy

Agyn is deployed to Kubernetes.

There are two public deployment entry points:

- `agynio/bootstrap` provisions a local/reference environment with Terraform stacks.
- `agynio/platform-charts` provides Helm umbrella charts for platform and apps workloads.

## Deployment sections

- [Bootstrap stacks](./bootstrap-stacks.md) explains the Terraform stack order.
- [Helm charts](./helm-charts.md) explains `agyn-platform` and `agyn-apps`.
- [Routing and domains](./routing-and-domains.md) lists default local URLs and hostnames.
- [Production secrets](./production-secrets.md) shows secret-first chart configuration.
