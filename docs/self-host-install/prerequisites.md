---
title: Prerequisites
description: What you need before installing Agyn, by install path.
order: 1
---

# Prerequisites

Requirements differ by install path. The bootstrap path provisions almost everything for you; the production path expects you to bring proven infrastructure.

## For the quick bootstrap path

For local development and demos. Bootstrap creates a k3d cluster on your machine and installs every dependency.

### Tools

| Tool | Minimum version | Notes |
|---|---|---|
| Docker | 24+ | Container runtime. k3d runs Kubernetes inside Docker. |
| `kubectl` | 1.27+ | Match your cluster version. |
| `k3d` | Latest | Bundled by bootstrap if missing on most setups. |
| Terraform | 1.6+ | Used to provision the cluster and apply manifests. |
| Git | Any modern version | To clone the bootstrap repo. |

### Resources

| Resource | Minimum |
|---|---|
| CPU | 4 cores |
| Memory | 8 GB free |
| Disk | 30 GB free |

### DNS

Bootstrap adds `agyn.dev` entries to your `/etc/hosts` automatically (with sudo). If you cannot modify hosts, set up your own DNS pointing `*.agyn.dev` to `127.0.0.1`.

### Network

Bootstrap publishes the platform on `https://agyn.dev:2496/`. Make sure ports `2496` and `6443` are free.

## For the production install path

Bring your own infrastructure. Agyn does not provision any of these for you in production.

### Kubernetes cluster

| Requirement | Notes |
|---|---|
| Version | 1.27+ recommended. |
| Node sizing | Plan for at least 3 nodes, 4 vCPU and 16 GB each. Agent workloads scale horizontally — size for peak concurrent agents. |
| Storage class | A default StorageClass supporting `ReadWriteOnce` PVCs for agent volumes. |
| Ingress | Istio mesh — Agyn services communicate through Istio with `AuthorizationPolicy` for internal RPC gating. |

### Identity provider (OIDC)

Users sign into the Console with OIDC. Any standards-compliant IdP works (Auth0, Okta, Keycloak, Google, etc.). You will need:

- An OIDC client with **Authorization Code + PKCE** enabled.
- A configured redirect URI for your Console hostname (e.g. `https://console.agyn.example.com/auth/callback`).
- The issuer URL, client ID, and (if required) client secret.

Users are auto-provisioned on first login via the IdP's UserInfo endpoint.

### Object storage

Files uploaded into conversations are stored in S3-compatible object storage.

- Any S3-compatible provider (AWS S3, GCS via S3 interop, MinIO, Wasabi, etc.).
- One bucket dedicated to Agyn.
- Access key and secret with `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, and presigned URL support.

### Databases

| Database | Used by | Notes |
|---|---|---|
| PostgreSQL 14+ | Threads, Users, Identity, Organizations, Agents, Runners, Tracing, Apps Service, Metering, OpenFGA | One Postgres instance with separate databases per service is typical. Tracing is the highest-volume database — size accordingly. |
| Redis 6+ | Notifications (pub/sub), short-lived caches | A managed Redis or a single in-cluster instance. |

### OpenZiti

Agyn uses [OpenZiti](https://openziti.io) as a private overlay network for agent workloads, LLM Proxy, and user-device port exposure.

You need an OpenZiti controller and at least one router reachable from the cluster. You can deploy these inside the cluster or use a managed deployment. The Agyn Ziti Management service handles all identity, service, and policy operations through the controller's Edge Management API.

### OpenFGA

Authorization is backed by [OpenFGA](https://openfga.dev), a ReBAC engine. The Authorization model is published with the platform charts.

- OpenFGA service reachable from the cluster.
- A PostgreSQL database for OpenFGA (separate from platform Postgres or shared).

### Secrets material

Have these ready before running `helm install`:

- `agyn-platform-postgres` — DSNs for each service database.
- `agyn-platform-redis` — Redis connection string.
- `agyn-platform-s3` — bucket name, region, access key, secret key.
- `agyn-platform-oidc` — issuer, client ID, client secret.
- `agyn-platform-ziti` — controller URL and admin certificate/key.
- `agyn-platform-openfga` — OpenFGA service URL and API token.

The exact Secret names and keys are documented in the `platform-charts` repo. See [Reference → Helm values](../reference/helm-values.md).

### TLS

You need a valid TLS certificate for `console.<your-domain>`, `gateway.<your-domain>`, and `chat.<your-domain>`, or a wildcard. Issue with cert-manager + Let's Encrypt, or with your own ACME provider.

## Related

- [Quick bootstrap](./quick-bootstrap.md)
- [Production install](./production-install.md)
- [Operate → Architecture overview](../operate/architecture.md)
- [Operate → Security](../operate/security.md)
