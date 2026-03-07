# DevSpace workflow for platform-server

This guide walks through launching `platform-server` inside the
`bootstrap_v2` cluster with a single `devspace dev` invocation.

## Prerequisites

- macOS or Linux workstation with Docker (or k3d) installed
- [`devspace`](https://devspace.sh/docs/cli/installation)
- Local cluster provisioned via
  [`agynio/bootstrap_v2`](https://github.com/agynio/bootstrap_v2) (follow the
  Quickstart in its README; it provides the kubeconfig path—usually
  `bootstrap_v2/k8s/.kube/agyn-local-kubeconfig.yaml`).

## 1. Prepare the cluster

Run `agynio/bootstrap_v2` according to its Quickstart to provision the cluster
and supporting services. The Quickstart configures kubectl with the
`agyn-local` context (or provides the kubeconfig path). Ensure your shell has
the appropriate kubeconfig exported before proceeding.

## 2. Start DevSpace

Change into `packages/platform-server` and run:

```bash
cd packages/platform-server
devspace dev
```

DevSpace deploys the prebuilt dev image `ghcr.io/agynio/platform-server:dev`,
which bundles the tooling needed for `pnpm` but no application sources. The
repository is synced into `/opt/app/data/workspace` (an `emptyDir` exposed by
the chart), and the container now runs a minimal startup script:

```sh
corepack pnpm install
corepack pnpm --filter @agyn/platform-server dev
```

Environment variables, volume mounts, and the pod security context are
provided by `bootstrap_v2`; DevSpace leaves them as-is. Production images
continue to be built by the existing CI pipeline and are separate from this
workflow.

Ahead of the Helm release, DevSpace applies a dev-only Kubernetes Job plus
scoped RBAC inside the `argocd` namespace. The Job authenticates against the
Kubernetes API using its service account token and issues a JSON merge-patch
that sets `spec.syncPolicy.automated` to `null` on the
`Application/platform-server` resource. No `kubectl` or Argo CD CLI calls run
inside the container—the patch is fully in-cluster. The Job is tracked as a
DevSpace deployment, so `devspace purge` removes the Job, Role, RoleBinding,
and ServiceAccount along with the Helm release.

The Helm release still requests 2 GiB of memory to keep `pnpm` installs from
being OOM-killed.

To confirm the deployment is ready, check the pod status:

```bash
kubectl get pods -n platform -l app.kubernetes.io/name=platform-server
```

## 3. Cleanup

1. Terminate DevSpace (`Ctrl+C`).
2. Purge the dev release:
   ```bash
   devspace purge
   ```
