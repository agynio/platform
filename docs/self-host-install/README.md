---
title: Self-host install
description: Install Agyn on your own Kubernetes cluster.
order: 2
---

# Self-host install

Skip this section if you use Agyn Cloud — your platform is already running. Continue to [Administer](../administer/README.md) instead.

Agyn runs on Kubernetes. There are two install paths:

| Path | When to use it |
|---|---|
| **Quick bootstrap** | Local development, demos, evaluation. Provisions a complete k3d cluster with every dependency via Terraform and Argo CD. One command. |
| **Production install** | Real deployments. Reuses the same Terraform stacks against your own cluster, OIDC, and DNS, with the in-cluster Postgres / S3 / OpenFGA optionally replaced by managed services. |

## Pages

- [Prerequisites](./prerequisites.md) — what you need before installing.
- [Quick bootstrap](./quick-bootstrap.md) — one-command install for development and demos.
- [Production install](./production-install.md) — bring bootstrap up against your own cluster, OIDC, and domain.
- [First admin](./first-admin.md) — how the cluster admin user is provisioned at install.
- [Upgrades](./upgrades.md) — upgrade the platform installed via bootstrap.
- [Uninstall](./uninstall.md) — remove Agyn cleanly.

## After install

Once Agyn is running:

1. Sign into the Console at the URL printed by the installer.
2. Follow [First admin](./first-admin.md) to bind your OIDC subject to the cluster admin role.
3. Continue to [Administer](../administer/README.md) to create your first organization, register runners, and configure agents.
4. Review [Operate](../operate/README.md) for day-2 concerns (backups, monitoring, security).
