---
title: Quick bootstrap
description: One-command install for local development, demos, and evaluation.
order: 2
---

# Quick bootstrap

The fastest way to get Agyn running. The bootstrap repo provisions a local k3d cluster and applies every platform stack via Terraform — Istio, OpenZiti, OpenFGA, Postgres, MinIO, all platform services, and the built-in apps.

This path is for development and evaluation. For production, see [Production install](./production-install.md).

## Before you start

Confirm you have the [prerequisites](./prerequisites.md): Docker running, Terraform, and `kubectl` if you want kubeconfig merged.

## Install

```sh
git clone https://github.com/agynio/bootstrap.git
cd bootstrap
chmod +x apply.sh
./apply.sh
```

For non-interactive defaults (skips all prompts, uses defaults, merges kubeconfig automatically):

```sh
./apply.sh -y
```

Initial deployment takes about 15 minutes — most of it cluster provisioning, image pulls, and waiting for Argo CD applications to sync.

### What it does, step by step

The installer applies nine stacks in order. Each waits for the previous to be healthy before continuing:

| # | Stack | What it provisions |
|---|---|---|
| 1 | `k8s` | k3d cluster (1 server + 2 agents) on Docker. |
| 2 | `system` | Istio (base, istiod, ingress gateway), Argo CD, local CA, wildcard TLS cert for `*.agyn.dev`. |
| 3 | install-ca-cert | Adds the local CA to your system trust store. **Asks for sudo** so browsers trust the wildcard cert without warnings. |
| 4 | `routing` | Istio `Gateway` resource that exposes every platform hostname on `:2496`. |
| 5 | `deps` | cert-manager, trust-manager, OpenZiti controller. Waits for each to be `Synced + Healthy` in Argo CD. |
| 6 | `ziti` | OpenZiti router. Waits for the Ziti Management API to be ready first. |
| 7 | `data` | Postgres, MinIO (S3-compatible), OpenFGA + OpenFGA's own Postgres. |
| 8 | `platform` | All platform services — gateway, threads, chat, agents, runners, users, identity, organizations, authorization, llm, llm-proxy, secrets, tracing, notifications, metering, files, media-proxy, token-counting, ziti-management, expose, plus the Console / Chat / Tracing browser apps. Deployed as Argo CD applications. |
| 9 | `apps` | k8s-runner, Reminders app, Telegram Connector app. Creates the `Platform` organization and the bootstrap admin user. |

Per-step timing is printed at the end.

## Defaults

Bootstrap uses these defaults unless you override them with environment variables before running `apply.sh`:

| Variable | Default |
|---|---|
| `DOMAIN` | `agyn.dev` |
| `PORT` | `2496` |
| `OIDC_ISSUER_URL` | `https://mockauth.dev/r/.../oidc` (a public mock IdP — fine for evaluation) |
| `OIDC_CLIENT_ID` | hardcoded mock client |
| `OIDC_CLIENT_SECRET` | hardcoded mock secret |
| `ADMIN_OIDC_SUBJECT` | `admin@agyn.io` |

For real OIDC, set those env vars before `apply.sh`. See [First admin](./first-admin.md) for how the admin user is provisioned.

## What you get

| URL | Purpose |
|---|---|
| `https://agyn.dev:2496/` | Platform UI (default landing). |
| `https://console.agyn.dev:2496/` | Console — admin UI. |
| `https://chat.agyn.dev:2496/` | Chat — user-facing app. |
| `https://tracing.agyn.dev:2496/` | Tracing app. |
| `https://gateway.agyn.dev:2496/` | Gateway API (subdomain). |
| `https://agyn.dev:2496/api` | Gateway API (path-based). |
| `https://argocd.agyn.dev:2496/` | Argo CD — see deployment state per service. |
| `https://openfga.agyn.dev:2496/` | OpenFGA API. |
| `https://openfga-playground.agyn.dev:2496/` | OpenFGA Playground. |
| `https://ziti.agyn.dev:2496/` · `https://ziti-mgmt.agyn.dev:2496/` | OpenZiti client / management API. |

`agyn.dev` and its subdomains resolve to `127.0.0.1` automatically — no `/etc/hosts` edits needed. The wildcard TLS certificate is signed by the local CA installed in step 3, so browsers should not warn.

## Sign in

Open the Console URL and sign in with `admin@agyn.io` (the default admin) via the mock OIDC provider. After signing in you have cluster admin rights — confirm via [First admin](./first-admin.md).

If you set `ADMIN_OIDC_SUBJECT` to your own subject before running `apply.sh`, sign in as that user instead.

## Kubeconfig

If you confirmed the kubeconfig merge (or ran with `-y`), `~/.kube/config` now includes the `agyn-local` context:

```sh
kubectl config use-context k3d-agyn-local
kubectl get pods -A
```

If you skipped the merge, the kubeconfig is at `bootstrap/stacks/k8s/.kube/agyn-local-kubeconfig.yaml`.

## Develop a single service

Once bootstrap is running, you can iterate on an individual platform service against the local cluster with [DevSpace](https://devspace.sh) from that service's repository:

```sh
cd ../gateway
devspace dev      # syncs local code, exits when ready
devspace dev -w   # interactive: stays attached with logs and hot-reload
```

DevSpace pauses the service's Argo CD auto-sync, syncs local source into the running pod, and restarts the process with hot-reload. Auto-sync is restored on exit.

## Teardown

There is no `destroy.sh`. Tear down by running `terraform destroy` on each stack in reverse:

```sh
terraform -chdir=stacks/apps destroy
terraform -chdir=stacks/platform destroy
terraform -chdir=stacks/data destroy
terraform -chdir=stacks/ziti destroy
terraform -chdir=stacks/deps destroy
terraform -chdir=stacks/routing destroy
terraform -chdir=stacks/system destroy
terraform -chdir=stacks/k8s destroy
```

The `k8s` destroy removes the k3d cluster itself. See [Uninstall](./uninstall.md) for the full sequence.

## Troubleshooting

- **Docker not running / not enough resources.** Most failures during the `k8s` and `data` stacks come from Docker. Give it at least 6 vCPU, 12 GB RAM.
- **Port 2496 or 6443 already in use.** Stop whatever holds them (`lsof -i :2496`) or override `PORT` for ingress.
- **Argo CD applications stuck `Progressing`.** First-time image pulls take time. The installer waits up to 10 minutes per app group. If something stays stuck, `kubectl -n <ns> logs <pod>` from the failing pod.
- **CA cert install denied.** The CA install step needs sudo. If you cancel it, browsers will warn on every `*.agyn.dev` URL. Re-run `./install-ca-cert.sh -y local-certs/ca-agyn-dev.pem` later.
- **`agyn.dev` doesn't resolve.** Very rare — the domain is configured to point at `127.0.0.1` publicly. If your network or DNS provider strips this, set a custom `DOMAIN` and add it to `/etc/hosts` yourself.

See [Troubleshooting → Install](../troubleshooting/install.md) for the full diagnostic flow.

## Related

- [Prerequisites](./prerequisites.md)
- [First admin](./first-admin.md)
- [Administer → Console overview](../administer/console-overview.md)
- [Production install](./production-install.md)
