# DevSpace workflow for platform-server

This guide documents the lightweight DevSpace workflow for iterating on
`platform-server` inside the `bootstrap_v2` cluster. The configuration reuses
the bootstrap-provisioned deployment and only disables ArgoCD auto-sync while
the session is active, keeping the runtime environment aligned with the dev
cluster.

## Prerequisites

- macOS or Linux workstation with Docker (or k3d) installed
- [`devspace`](https://devspace.sh/docs/cli/installation)
- Local cluster provisioned via
  [`agynio/bootstrap_v2`](https://github.com/agynio/bootstrap_v2) (follow the
  Quickstart in its README; it provides the kubeconfig path—usually
  `bootstrap_v2/k8s/.kube/agyn-local-kubeconfig.yaml`).

## 1. Ensure the cluster is running

Run `agynio/bootstrap_v2` according to its Quickstart to provision the cluster
and supporting services. The bootstrap scripts configure kubectl with the
`agyn-local` context (or provide the kubeconfig path). Ensure your shell has
the appropriate kubeconfig exported before proceeding.

## 2. Start DevSpace

Launch DevSpace from the repository root:

```bash
cd packages/platform-server
devspace dev
```

The `dev` pipeline attaches to the existing `platform-server-dev` pod, disables
ArgoCD auto-sync for the `platform-server` application (via a pre-dev hook),
and starts `pnpm dev` inside the container using the synced workspace at
`/opt/app/data/workspace`. The hook only touches auto-sync; all runtime
configuration continues to come from bootstrap.

During startup the container waits for the repository files to sync, prepares a
writeable workspace (`.cache`, `.pnpm-store`, `tmp`), pins cache-related
environment variables, and uses Corepack to run scoped `pnpm install` followed
by `pnpm dev` for `packages/platform-server`.

To confirm the pod is ready, check its status:

```bash
kubectl get pods -n platform -l app.kubernetes.io/name=platform-server
```

### Re-enabling ArgoCD auto-sync

When you finish your DevSpace session you can optionally re-enable auto-sync:

```bash
kubectl patch application platform-server -n argocd \
  --type merge \
  -p '{"spec":{"syncPolicy":{"automated":{}}}}'
```

## 3. End the session

Terminate DevSpace with `Ctrl+C`. No additional purge step is required because
the deployment is managed by bootstrap. If you re-enable auto-sync, ArgoCD will
resume reconciling the deployment immediately.
