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

1. Run `agynio/bootstrap_v2` according to its Quickstart to provision the
   cluster and supporting services.
2. Export the kubeconfig path and select the context:
   ```bash
   export KUBECONFIG="$(pwd)/bootstrap_v2/k8s/.kube/agyn-local-kubeconfig.yaml"
   kubectl config use-context agyn-local
   ```

## 2. Start DevSpace

From `packages/platform-server`, run:

```bash
devspace dev
```

DevSpace builds the local image, deploys the chart release `platform-server`,
and syncs `packages/platform-server` into the pod. The container process runs
the same entrypoint as `pnpm dev` (`tsx src/index.ts`).

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
