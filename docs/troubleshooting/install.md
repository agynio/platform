---
title: Install issues
description: Bootstrap won't come up, stacks fail to apply, services won't reach Healthy.
order: 1
---

# Install issues

## `./apply.sh` fails immediately

- **Terraform not installed.** Bootstrap requires the `terraform` CLI. Install it before running.
- **Docker not running.** The `k8s` stack creates a k3d cluster in Docker. Start Docker Desktop / dockerd.
- **Insufficient Docker resources.** k3d + every platform service is heavy. Give Docker at least 6 vCPU and 12 GB RAM (Docker Desktop → Settings → Resources).
- **Port 2496 or 6443 already in use.** Stop whatever holds them (`lsof -i :2496`) or set `PORT=<free port>` before re-running.

## k3d cluster up, but pods stay `Pending` or restart

```sh
kubectl describe pod -n <ns> <pod>
kubectl logs -n <ns> <pod> -c <container>
```

Read the **Events** at the bottom. Common causes:

- `Insufficient cpu` / `Insufficient memory` → bump Docker resources.
- `MountVolume.SetUp failed` → storage provisioning issue. `terraform -chdir=stacks/k8s destroy && ./apply.sh` to recreate the cluster fresh.
- `ImagePullBackOff` → see [Image pull failures](#image-pull-failures) below.
- `CrashLoopBackOff` on a platform service → check the container logs; most often a downstream dependency (Postgres, OpenFGA) isn't healthy yet.

## A stack fails partway through

`apply.sh` runs nine stacks in sequence and exits on the first failure. The failing stack's name is printed in the `[TIMING]` line just before exit.

Common failures:

- **`deps` waits forever for `cert-manager` / `trust-manager` / `ziti-controller`.** They install via Argo CD. Check `https://argocd.agyn.dev:2496/` (or `kubectl get applications -n argocd`). The failing application's events page tells you why.
- **`ziti` exits with "OpenZiti Management API did not become ready".** The ziti-controller pod is still starting or unhealthy. `kubectl -n ziti logs deploy/ziti-controller`. Wait and re-run the `ziti` stack alone: `terraform -chdir=stacks/ziti apply`.
- **`platform` fails on a service-specific Argo CD app.** `apply.sh` waits per-app; the failing app's name is logged plus pod state. Most often: image pull, DB connectivity, or a chart bug in a specific service version.

You can re-run a single stack after fixing the issue:

```sh
terraform -chdir=stacks/<stack> apply
```

Each stack picks up where the previous succeeded.

## Argo CD applications show `OutOfSync`

```sh
kubectl get applications -n argocd
```

For any `OutOfSync` app: open Argo CD's UI (`https://argocd.agyn.dev:2496/`) and click Sync — or `argocd app sync <name>` if you have the CLI installed.

If sync keeps failing, open the app and look at the **App Health** section. The failing resource's status is usually self-explanatory.

## Browser can't open `https://agyn.dev:2496/`

- **The CA cert install step was skipped or cancelled.** Browsers warn on every URL. Re-run:
  ```sh
  ./install-ca-cert.sh -y local-certs/ca-agyn-dev.pem
  ```
- **`agyn.dev` doesn't resolve to `127.0.0.1`.** Very rare — the domain is configured publicly. If your DNS resolver strips it (corporate networks sometimes do), set a custom `DOMAIN` and add it to `/etc/hosts` yourself.
- **You changed `DOMAIN` but didn't add it to your hosts file.** Custom domains need a real resolution path. Add `127.0.0.1 <domain> *.<domain>` to `/etc/hosts` or run a local DNS.
- **Ingress isn't routed.** `kubectl get gateway -A` should show `platform-gateway` in `istio-gateway`. If missing, the `routing` stack didn't run.

## Image pull failures

If any pod shows `ImagePullBackOff`:

```sh
kubectl describe pod -n <ns> <pod>
```

Look at the **Events**:

- `unauthorized: authentication required` → you're pulling from a private registry. Set `GHCR_USERNAME` and `GHCR_TOKEN` before re-running `apply.sh`. The platform stack uses these to create the registry pull secret.
- `manifest unknown` → the image tag in `stacks/platform/variables.tf` doesn't exist upstream. Either bump or pin a known-good version.
- `rate limited` → Docker Hub. The k3d image and some upstream deps are on Docker Hub; authenticated pulls or a mirror avoid this.

For agent workloads (not the platform services themselves) pulling from your private registry: see [Administer → Image pull secrets](../administer/image-pull-secrets.md).

## Database migrations stuck

If a service pod is stuck in `Init` running a migration:

```sh
kubectl logs -n <ns> <pod> -c <init-container>
```

The platform's per-service charts run migrations as Init containers. They are idempotent — delete the failing pod and let the Deployment recreate it:

```sh
kubectl delete pod -n <ns> <pod>
```

If the migration genuinely fails (constraint violation, missing column from a prior state), check the service's release notes for known migration issues. If none, file an issue against the service repository.

## `gateway` returns 502 after install

Gateway depends on most services. If any are unhealthy, Gateway can fail readiness probes.

```sh
kubectl get pods -A | grep -v Running
```

Wait for everything to be `Ready 1/1` before assuming Gateway is broken. First-time deploys take about 15 minutes total — Gateway is one of the last services to settle because it talks to everyone.

## Bootstrap re-run after a failed apply

It's safe to re-run `./apply.sh` after fixing an issue. Each stack's `terraform apply` is idempotent. Argo CD applications converge to their declared state.

If a partial install is genuinely broken and you want a clean slate, see [Uninstall — quick reset](../self-host-install/uninstall.md#quick-reset-keep-your-laptop-tidy).

## Related

- [Self-host install → Prerequisites](../self-host-install/prerequisites.md)
- [Self-host install → Quick bootstrap](../self-host-install/quick-bootstrap.md)
- [Self-host install → Production install](../self-host-install/production-install.md)
- [Operate → Logging & audit](../operate/logging-audit.md)
- [Operate → Monitoring](../operate/monitoring.md)
