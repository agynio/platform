---
title: Production installation
description: Install Agyn on your own Kubernetes cluster from the umbrella charts.
order: 3
---

# Production installation

Agyn deploys to your own Kubernetes cluster from two umbrella charts at `oci://ghcr.io/agynio/charts`, with a provisioning step between them.

Skip this section if you use Agyn Cloud — your platform is already running. For a laptop, see [Local installation](../local-install/README.md) instead.

| Chart | What it deploys |
|---|---|
| `agyn-platform` | The control plane — the services behind the API |

Between them you authorize the OpenZiti overlay, sign in, and enroll a runner. That middle step cannot live in a chart: it acts on the OpenZiti controller and on the platform API the first chart has just started. [Install](./install.md) covers all four phases.

## Pages

- [Prerequisites](./prerequisites.md) — cluster, dependencies, DNS, OIDC.
- [Install](./install.md) — the four phases, in order.
- [Cluster administrators](./first-admin.md) — how cluster admin is declared, and how to recover it.
- [Upgrades](./upgrades.md) — moving between chart versions.
- [Uninstall](./uninstall.md) — removing Agyn cleanly.

## After install

- [Administer → Console overview](../administer/console-overview.md)
- [Operate → Security](../operate/security.md)
- [Operate → Backup & DR](../operate/backup-disaster-recovery.md)
- [Operate → Monitoring](../operate/monitoring.md)
