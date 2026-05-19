---
title: Prerequisites
description: What you need before installing Agyn.
order: 1
---

# Prerequisites

The quick bootstrap is the only fully-documented install path today. Production install (your own cluster, real OIDC, real domain) reuses the same stacks with overridden variables — the same prerequisites apply, plus a few extras called out at the end.

## Tools

| Tool | Minimum | Required for |
|---|---|---|
| Docker | 24+ | Hosting the local k3d cluster. Must be running. |
| Terraform | 1.6+ | Provisioning every stack. |
| `kubectl` | 1.27+ | Optional. Needed only if you want bootstrap to merge the generated kubeconfig into `~/.kube/config` and for interacting with the cluster afterward. |

You do **not** need `k3d` installed separately — the Terraform `k3d` provider creates the cluster.

You do **not** need `git` to run bootstrap, only to clone it.

## Operating system

`apply.sh` and the CA cert installer support **macOS** (Darwin) and **Linux** (Debian/Ubuntu, RHEL/Fedora/CentOS, Alpine). Windows is not supported — use WSL2.

## Resources

Bootstrap provisions a k3d cluster with 1 server + 2 agent nodes plus every platform service. Give Docker enough headroom; cramped Docker is the most common bootstrap failure.

Suggested minimum: **6 vCPU, 12 GB RAM, 30 GB free disk**. Lower works for a partial bring-up but you will hit pod evictions.

## Ports

Bootstrap exposes two ports on the host:

| Port | Used by |
|---|---|
| `2496` | Ingress — everything reachable at `https://*.agyn.dev:2496/`. Override with `PORT`. |
| `6443` | Kubernetes API server. Used by `kubectl` after kubeconfig merge. |

Both must be free before you start.

## DNS

`agyn.dev` and its subdomains resolve to `127.0.0.1` automatically — no `/etc/hosts` edits required. The bootstrap does not modify your hosts file.

If you set a custom domain via `DOMAIN`, you are responsible for making it resolve to `127.0.0.1` (typically by adding host entries yourself or pointing public DNS at loopback).

## OIDC

The bootstrap defaults to a public mock OIDC issuer (`mockauth.dev`) so first-run sign-in works out of the box. The default admin sign-in user is `admin@agyn.io`. No real IdP is needed for evaluation.

To use a real IdP, override these environment variables before running `apply.sh`:

- `OIDC_ISSUER_URL`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `ADMIN_OIDC_SUBJECT` — OIDC subject that should be granted cluster admin (default `admin@agyn.io`)
- `TRACING_APP_OIDC_CLIENT_ID` — only if you use a separate client for the Tracing app

See [Quick bootstrap](./quick-bootstrap.md) for the full sequence.

## Optional: GHCR access for private charts

Bootstrap pulls service Helm charts and images from `ghcr.io/agynio/*`. Most are public. If your install requires authenticated pulls (private fork, internal mirror), set:

- `GHCR_USERNAME`
- `GHCR_TOKEN`

Skip these for the standard install.

## Production install — extra notes

Today, production deployments reuse the bootstrap Terraform stacks with their own variables. A centralized umbrella chart at [`agynio/platform-charts`](https://github.com/agynio/platform-charts) is in preparation and will eventually replace per-service deployment in bootstrap, but it is not in use today. In addition to the above you will want:

- **Your own Kubernetes cluster** instead of k3d. Skip the `k8s` stack and point the Kubernetes / Helm providers at your existing cluster.
- **A real OIDC IdP** with `Authorization Code + PKCE` enabled.
- **A real DNS domain** with a wildcard or specific entries pointing to your ingress.
- **A real TLS certificate** (cert-manager + Let's Encrypt, or your CA) replacing the locally-generated wildcard cert.
- **External Postgres, Redis, S3, OpenFGA, OpenZiti** if you don't want the embedded versions the `data` and `deps` stacks deploy.

A polished production install path is still maturing — open an issue on [`agynio/bootstrap`](https://github.com/agynio/bootstrap) if you are running into specific gaps.

## Related

- [Quick bootstrap](./quick-bootstrap.md)
- [Production install](./production-install.md)
- [Operate → Architecture overview](../operate/architecture.md)
