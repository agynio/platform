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
the appropriate kubeconfig exported before proceeding. Confirm the Argo CD
Application and deployment exist before attaching DevSpace:

```bash
kubectl get application platform-server -n argocd
kubectl get deployment platform-server -n platform
```

## 2. Start DevSpace

Launch DevSpace from the repository root:

```bash
cd packages/platform-server
devspace dev
```

The `dev` pipeline selects the existing `platform-server` pod (matching
`app.kubernetes.io/name=platform-server`), disables ArgoCD auto-sync for the
application via a pre-dev hook, and runs a minimal bootstrap command inside the
synced workspace:

```sh
sh -lc 'corepack enable && corepack pnpm install && corepack pnpm --filter @agyn/platform-server dev'
```

The workspace is synced two-way to `/opt/app/data/workspace`; no chart, env, or
volume overrides are introduced.

To confirm the pod is ready and the API is serving traffic:

```bash
kubectl get pods -n platform -l app.kubernetes.io/name=platform-server
curl -k https://api.agyn.dev:8080/healthz
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
