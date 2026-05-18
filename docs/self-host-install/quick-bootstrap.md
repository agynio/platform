---
title: Quick bootstrap
description: One-command install for local development, demos, and evaluation.
order: 2
---

# Quick bootstrap

The fastest way to get Agyn running. Bootstrap provisions a complete platform on your machine: a k3d Kubernetes cluster, Argo CD, Istio, OpenZiti, OpenFGA, Postgres, Redis, MinIO, and every Agyn service.

This path is for development and evaluation only. For production, see [Production install](./production-install.md).

## Before you start

Confirm you have the [bootstrap prerequisites](./prerequisites.md#for-the-quick-bootstrap-path) installed.

## Install

```sh
git clone https://github.com/agynio/bootstrap.git
cd bootstrap
chmod +x apply.sh
./apply.sh
```

For non-interactive defaults:

```sh
./apply.sh -y
```

The installer:

1. Provisions a k3d cluster on Docker.
2. Adds `agyn.dev` entries to `/etc/hosts` (asks for sudo).
3. Installs Argo CD and applies all Agyn application manifests.
4. Provisions OpenZiti and OpenFGA and seeds them with the platform's identities and authorization model.
5. Creates a synthetic admin identity with an API token, and uses that token to bind your real admin user via the Gateway.

Initial deployment takes 5-10 minutes depending on network speed for image pulls.

## What you get

| URL | Purpose |
|---|---|
| `https://agyn.dev:2496/` | Console — admin UI |
| `https://agyn.dev:2496/chat` | Chat — user-facing app |
| `https://agyn.dev:2496/tracing` | Tracing app |
| `https://agyn.dev:2496/api` | Gateway API |
| `https://argocd.agyn.dev:2496/` | Argo CD — see service deployment state |
| `https://openfga-playground.agyn.dev:2496/` | OpenFGA Playground — explore authorization tuples |

All certificates are self-signed; your browser will warn the first time.

## Sign in

Bootstrap configures a local OIDC IdP for you. Open the Console URL, click **Sign in**, and use the default test user printed at the end of the installer output.

After signing in, follow [First admin](./first-admin.md) to confirm you have cluster admin rights.

## Develop a single service

If you are working on one Agyn service against a running bootstrap cluster, use [DevSpace](https://devspace.sh) from inside that service's repository:

```sh
cd gateway
devspace dev      # syncs local code, exits when ready
devspace dev -w   # interactive: stays attached with logs and hot-reload
```

DevSpace pauses Argo CD auto-sync on the target deployment, syncs your local source into the running pod, and restarts the process with hot-reload. Auto-sync is restored on exit. See the service's own README for any service-specific dev steps.

## Teardown

```sh
./destroy.sh
```

Removes the cluster, hosts entries, and any local state created by bootstrap.

## Troubleshooting

- **Cluster fails to come up.** Make sure Docker has enough resources (Settings → Resources → at least 4 CPU, 8 GB). On macOS, the default Docker VM is often too small.
- **Argo CD shows applications stuck in `Progressing`.** Wait — image pulls on the first run can take several minutes. Check pod logs with `kubectl -n agyn logs <pod>` if it stays stuck.
- **Browser warnings about self-signed certificates.** Expected — accept them for `*.agyn.dev`.
- **Hosts file refuses to update.** Run `./apply.sh` with sudo, or manually add the lines printed at the start of the installer.

See [Troubleshooting → Install](../troubleshooting/install.md) for the full diagnostic flow.

## Related

- [Prerequisites](./prerequisites.md)
- [First admin](./first-admin.md)
- [Administer → Console overview](../administer/console-overview.md)
- [Production install](./production-install.md)
