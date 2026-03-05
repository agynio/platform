# DevSpace workflow for platform-server

This guide walks through launching `platform-server` inside the
`bootstrap_v2` cluster with a single `devspace dev` invocation.

## Prerequisites

- macOS or Linux workstation with Docker (or k3d) installed
- [`kubectl`](https://kubernetes.io/docs/tasks/tools/)
- [`helm`](https://helm.sh/docs/intro/install/)
- [`devspace`](https://devspace.sh/docs/cli/installation)
- [`argocd` CLI](https://argo-cd.readthedocs.io/en/stable/cli_installation/) (or
  access to the Argo CD UI)
- `agynio/bootstrap_v2` repository cloned locally

## 1. Prepare the cluster

1. Follow `bootstrap_v2/README.md` to create the k3d cluster (or targeted
   environment) and generate the kubeconfig.
2. Apply the Terraform stacks in order:
   ```bash
   cd bootstrap_v2/stacks/k8s && terraform init && terraform apply
   cd ../system && terraform init && terraform apply
   cd ../platform && terraform init && terraform apply
   ```
3. Export the kubeconfig path and select the context:
   ```bash
   export KUBECONFIG="$(pwd)/bootstrap_v2/k8s/.kube/agyn-local-kubeconfig.yaml"
   kubectl config use-context agyn-local
   ```
4. Confirm the `platform` namespace is present:
   ```bash
   kubectl get ns platform
   ```

## 2. Pause Argo CD reconciliation

Suspend the managed deployment while DevSpace is in control:

```bash
argocd app set platform-server --sync-policy none
argocd app terminate-op platform-server || true
```

Record the current settings so you can restore automation later.

## 3. Start DevSpace

From `packages/platform-server`, run:

```bash
devspace dev
```

DevSpace builds the local image, deploys the chart release `platform-server`,
and syncs `packages/platform-server` into the pod. The container process runs
the same entrypoint as `pnpm dev` (`tsx src/index.ts`).

To verify the service through the Istio gateway, map `api.agyn.dev` to the
gateway endpoint (typically `127.0.0.1` in k3d) or use:

```bash
curl --resolve api.agyn.dev:443:127.0.0.1 \
  https://api.agyn.dev/healthz --insecure
```

The bootstrap_v2 gateway certificate is self-signed; trust the CA or pass
`--insecure` while testing locally.

## 4. Cleanup and resume Argo CD

1. Terminate DevSpace (`Ctrl+C`).
2. Purge the dev release:
   ```bash
   devspace purge
   ```
3. Restore Argo CD automation:
   ```bash
   argocd app set platform-server --sync-policy automated --self-heal --prune
   argocd app sync platform-server
   ```

After Argo resumes, the managed deployment reconciles back to the Git state
defined in `bootstrap_v2`.
