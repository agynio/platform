---
title: Uninstall
description: Remove Agyn cleanly.
order: 6
---

# Uninstall

Uninstalling means destroying the Terraform-managed stacks in reverse order. There is no `destroy.sh`, and bootstrap does not deploy an umbrella Helm release today.

## Bootstrap (local)

Tear down stack by stack, in reverse of `apply.sh`:

```sh
cd bootstrap

terraform -chdir=stacks/apps destroy
terraform -chdir=stacks/platform destroy
terraform -chdir=stacks/data destroy
terraform -chdir=stacks/ziti destroy
terraform -chdir=stacks/deps destroy
terraform -chdir=stacks/routing destroy
terraform -chdir=stacks/system destroy
terraform -chdir=stacks/k8s destroy
```

The `k8s` destroy removes the k3d cluster itself — at that point everything is gone (Docker containers, PVCs, all data).

Each destroy prompts for confirmation. Add `-auto-approve` if you're scripting.

### Quick reset (keep your laptop tidy)

If you only want to start fresh and don't care about preserving anything:

```sh
terraform -chdir=stacks/k8s destroy -auto-approve
```

That alone deletes the k3d cluster — all platform state goes with it. Then re-run `./apply.sh` to recreate.

### What gets removed

- The k3d cluster (Docker containers).
- All Kubernetes resources in the cluster (services, deployments, PVCs, Argo CD applications).
- The local kubeconfig file at `stacks/k8s/.kube/agyn-local-kubeconfig.yaml`.

### What doesn't get removed

- The locally-installed CA certificate (it's in your system keychain). Remove it manually:
  - **macOS**: open Keychain Access → System keychain → search "agyn" → delete.
  - **Linux**: remove `/usr/local/share/ca-certificates/ca-agyn-dev.crt` (Debian/Ubuntu) or `/etc/pki/ca-trust/source/anchors/ca-agyn-dev.crt` (RHEL/Fedora), then run `sudo update-ca-certificates` or `sudo update-ca-trust extract`.
- The merged kubeconfig context in `~/.kube/config`. Remove with `kubectl config delete-context k3d-agyn-local` (and `delete-cluster`, `delete-user` for full cleanup).

## Production

For installs against your own cluster, the same `terraform destroy` reverse order applies — but you almost certainly don't want to also destroy your cluster, your databases, or your DNS. Run only the stacks that bootstrap created:

```sh
terraform -chdir=stacks/apps destroy
terraform -chdir=stacks/platform destroy
terraform -chdir=stacks/data destroy       # only if data services are bootstrap-managed
terraform -chdir=stacks/ziti destroy
terraform -chdir=stacks/deps destroy
terraform -chdir=stacks/routing destroy
terraform -chdir=stacks/system destroy
# Do NOT run terraform -chdir=stacks/k8s destroy in production —
# that's your real cluster.
```

### What's left behind in production

- **Your cluster** — untouched.
- **Your external Postgres / S3 / OpenFGA** if you wired them externally — untouched. Drop databases or empty buckets yourself if you want to fully purge.
- **OpenZiti identities** — if your OpenZiti deployment is shared, the platform's `agyn_*` identities are removed but the controller itself stays.
- **Your OIDC client registration** — remove it from your IdP if it's only used for Agyn.
- **TLS certificates** — the Secrets are removed but cert-manager may still hold cached certificates.

## Partial teardown

You can destroy individual stacks without affecting others, as long as you respect dependencies:

| Stack | Depends on |
|---|---|
| `apps` | `platform` |
| `platform` | `data`, `ziti`, `routing`, `system`, `k8s` |
| `data` | `system`, `k8s` |
| `ziti` | `deps`, `system`, `k8s` |
| `deps` | `system`, `k8s` |
| `routing` | `system`, `k8s` |
| `system` | `k8s` |

For example, to re-deploy just the platform services without touching the cluster or data:

```sh
terraform -chdir=stacks/apps destroy
terraform -chdir=stacks/platform destroy
terraform -chdir=stacks/platform apply
terraform -chdir=stacks/apps apply
```

This is also the way to recover from a botched platform-stack upgrade — destroy, fix, re-apply.

## Related

- [Quick bootstrap](./quick-bootstrap.md)
- [Production install](./production-install.md)
- [Upgrades](./upgrades.md)
- [Operate → Backup & DR](../operate/backup-disaster-recovery.md)
