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
| **Production install** | Real deployments. You bring your own Kubernetes, Istio, OpenZiti, OIDC, Postgres, S3, and OpenFGA; you install Agyn services with `platform-charts`. |

## Pages

- [Prerequisites](./prerequisites.md) — what you need before installing, depending on which path you choose.
- [Quick bootstrap](./quick-bootstrap.md) — one-command install for development and demos.
- [Production install](./production-install.md) — install Agyn on a production Kubernetes cluster with your own dependencies.
- [First admin](./first-admin.md) — claim the cluster admin role after install.
- [Upgrades](./upgrades.md) — upgrade Agyn and its data migrations.
- [Uninstall](./uninstall.md) — remove Agyn cleanly.

## After install

Once Agyn is running:

1. Sign into the Console at the URL printed by the installer.
2. Follow [First admin](./first-admin.md) to bind your OIDC subject to the cluster admin role.
3. Continue to [Administer](../administer/README.md) to create your first organization, register runners, and configure agents.
4. Review [Operate](../operate/README.md) for day-2 concerns (backups, monitoring, security).
