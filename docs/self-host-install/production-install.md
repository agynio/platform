---
title: Production install
description: Bringing bootstrap up against your own cluster, OIDC, and domain.
order: 3
---

# Production install

**Today**, production installs reuse the same Terraform stacks that the [quick bootstrap](./quick-bootstrap.md) runs, with overridden variables and (usually) without the `k8s` stack that provisions the local k3d cluster. Bootstrap deploys each platform service from its own chart.

A centralized umbrella Helm chart at [`agynio/platform-charts`](https://github.com/agynio/platform-charts) is in preparation and will eventually replace per-service deployment in bootstrap, making the production path cleaner. It is not production-ready yet — bootstrap is the canonical install path.

Until that lands, treat this page as the honest description of how to get there with what exists today.

## What "production" actually means here

| Concern | Bootstrap default | Production |
|---|---|---|
| Cluster | k3d in Docker on your laptop | Your own EKS / GKE / AKS / on-prem Kubernetes |
| Domain | `agyn.dev` (loopback) | Your real domain (e.g. `agyn.example.com`) |
| Port | `2496` | `443` (standard HTTPS), behind your real LB / ingress |
| TLS | Locally-generated wildcard cert + local CA | cert-manager + Let's Encrypt or your own CA |
| OIDC | Public mock IdP | Your real OIDC IdP |
| Postgres | In-cluster Postgres + MinIO (S3 mock) | Managed Postgres + managed S3 (or self-hosted production-grade) |
| OpenFGA | In-cluster with embedded Postgres | Managed OpenFGA or self-hosted with its own Postgres |
| OpenZiti | In-cluster controller + router | Same — currently no managed option |

## High-level approach

1. **Skip the `k8s` stack.** Don't create a k3d cluster. Point the Kubernetes + Helm providers in each stack at your existing cluster (configure `KUBECONFIG` or update the provider blocks).
2. **Replace the `system` stack's local cert chain.** The stock `system` stack generates a local CA and a self-signed wildcard cert. For production you want cert-manager-issued certificates instead. Adapt the stack or pre-create the TLS Secrets the platform expects and skip the cert-generation resources.
3. **Configure routing for real DNS.** The `routing` stack defines an Istio `Gateway` for the platform hostnames. Point your real DNS at the Istio ingress, and update the host list in the stack to match your domain.
4. **Run `deps`, `ziti`, `data`, `platform`, `apps` with production variables.** Set `OIDC_*`, `DOMAIN`, `ADMIN_OIDC_SUBJECT`, GHCR credentials (if needed) before applying. Each stack accepts overrides via `terraform apply -var ...` or environment variables.
5. **Externalize data plane state.** For each stack that deploys an in-cluster database or storage (Postgres, MinIO, OpenFGA's DB), either:
   - Replace with a managed-service reference (DSN pointed at your real DB), or
   - Keep the in-cluster instance but back its PVC by production-grade storage.

   Today this is a code change against the stack — there are no flags to switch.

## Practical install sequence

Once you have your cluster, DNS, OIDC, and any external services ready:

```sh
git clone https://github.com/agynio/bootstrap.git
cd bootstrap

# Set the things production needs to differ on:
export DOMAIN=agyn.example.com
export PORT=443
export OIDC_ISSUER_URL=https://login.example.com/oidc
export OIDC_CLIENT_ID=...
export OIDC_CLIENT_SECRET=...
export ADMIN_OIDC_SUBJECT=<your IdP subject>
export GHCR_USERNAME=...
export GHCR_TOKEN=...

# Skip the k8s stack; point providers at your real cluster (set KUBECONFIG or
# edit the provider blocks). Then apply stacks individually:

terraform -chdir=stacks/system init && terraform -chdir=stacks/system apply
./install-ca-cert.sh local-certs/ca-agyn-dev.pem    # only if you keep the local CA path

terraform -chdir=stacks/routing init && terraform -chdir=stacks/routing apply
terraform -chdir=stacks/deps    init && terraform -chdir=stacks/deps    apply
terraform -chdir=stacks/ziti    init && terraform -chdir=stacks/ziti    apply
terraform -chdir=stacks/data    init && terraform -chdir=stacks/data    apply
terraform -chdir=stacks/platform init && terraform -chdir=stacks/platform apply
terraform -chdir=stacks/apps    init && terraform -chdir=stacks/apps    apply
```

The order is the same as `apply.sh` runs them, minus `k8s` and minus the `install-ca-cert` step if you are using real TLS certificates.

## What you should not skip

- **Reading [Operate → Security](../operate/security.md)** before going live. Bootstrap defaults are tuned for local dev, not for production hardening.
- **Backups** — see [Operate → Backup & DR](../operate/backup-disaster-recovery.md).
- **Monitoring** — see [Operate → Monitoring](../operate/monitoring.md).
- **A real OIDC subject for the admin** — the mock IdP must not be used in production.

## Verify

After everything applies cleanly:

1. Open `https://console.<your-domain>/` and sign in via OIDC.
2. Confirm cluster admin context loads — see [First admin](./first-admin.md).
3. Send a test message in a conversation. The agent should start, respond, and idle out.
4. Check the Tracing app for the new run.

## What's still rough

- No supported way to skip the bootstrap's in-cluster Postgres / MinIO / OpenFGA without editing the stack code. Externalizing those today is a fork-and-modify exercise.
- Today bootstrap deploys each platform service from its own chart at `ghcr.io/agynio/charts/<service>`. A centralized umbrella chart at [`agynio/platform-charts`](https://github.com/agynio/platform-charts) is in preparation and will replace per-service deployment in bootstrap once it stabilizes. It is not production-ready yet — bootstrap is still the canonical install today.
- Upgrades and rollbacks for production are not yet documented for an externalized data plane. For now, snapshot and restore at the database level.

We are actively working to make this story cleaner. Feedback and contributions on [`agynio/bootstrap`](https://github.com/agynio/bootstrap) and [`agynio/platform-charts`](https://github.com/agynio/platform-charts) are welcome.

## Related

- [Prerequisites](./prerequisites.md)
- [Quick bootstrap](./quick-bootstrap.md)
- [First admin](./first-admin.md)
- [Upgrades](./upgrades.md)
- [Operate → Architecture overview](../operate/architecture.md)
- [Operate → Backup & DR](../operate/backup-disaster-recovery.md)
- [Operate → Security](../operate/security.md)
