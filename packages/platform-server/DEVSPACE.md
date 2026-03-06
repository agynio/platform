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
which bundles the tooling needed for `pnpm dev` (corepack/pnpm, Git, file
watchers) but no application sources. The repository is synced into the
ephemeral workspace at `/opt/app/data/workspace` (backed by the `data`
`emptyDir`), which is writable under the bootstrap-provisioned
`securityContext`. The container process runs the same entrypoint as `pnpm
dev` (`tsx src/index.ts`). Environment variables, volume mounts, and security
context are provided by `bootstrap_v2`; DevSpace does not override them.
Production images continue to be built by the existing CI pipeline and are
separate from this workflow.

Before Helm installs anything, DevSpace now runs a hook that patches the Argo CD
`Application/platform-server` with `kubectl patch --type merge --field-manager
devspace-argocd-sync-off --patch-file devspace/argocd-sync-off.yaml`. The patch
is a minimal merge object that removes only `spec.syncPolicy.automated`, so Argo
stops auto-syncing the release without disturbing the rest of the application
spec.

The helm release now requests 2 GiB of memory to keep `pnpm` installs from
being OOM-killed. The dev entrypoint waits for the sync to finish, installs
workspace dependencies with serialized `pnpm` (child concurrency `1`) when the
install marker is missing, runs `prisma generate`, and finally starts
`corepack pnpm --filter @agyn/platform-server dev` under `set -eu`.

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
