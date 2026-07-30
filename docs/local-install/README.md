---
title: Local installation
description: Run the whole platform on your machine with the Agyn CLI.
order: 2
---

# Local installation

`agyn local` runs the entire platform in a virtual machine on your own machine — control plane, OpenZiti overlay, database, object storage, and a runner that executes agents. One command, nothing to wire together.

Use it for development, demos, and evaluation. For a real deployment see [Production installation](../production-install/README.md).

```sh
agyn local start
```

That downloads the platform image, boots the VM, and records a profile so every other `agyn` command works against it.

## What you get

A single VM running the same components a production install deploys, sized for a laptop. Because it is one image, there is no phased install and no provisioning step between charts — the image ships with the overlay already authorized and a runner already enrolled.

| | Local | Production |
|---|---|---|
| Install | One command | Two charts and a provisioning step between them |
| Runs on | A VM on your machine | Your Kubernetes cluster |
| Dependencies | Bundled | Bundled or your own |
| Ingress | `https://*.agyn.dev:2496` | Your domain and certificates |
| Lifecycle | `agyn local start` / `stop` / `delete` | Helm upgrades |

## Pages

- [Prerequisites](./prerequisites.md) — what the VM needs from your machine.
- [Install](./install.md) — starting, configuring, and trusting the CA.
- [Manage](./manage.md) — status, upgrades, reset, and removal.

## Related

- [Production installation](../production-install/README.md)
- [Build & extend → Agyn CLI](../build-extend/agyn-cli.md)
