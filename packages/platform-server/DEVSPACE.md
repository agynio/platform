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
and supporting services. The wrapper script added in this repository resolves
the generated kubeconfig automatically.

## 2. Start DevSpace

From the repository root, run:

```bash
./devspace.sh
```

DevSpace deploys the prebuilt dev image `ghcr.io/agynio/platform-server:dev`,
which bundles the tooling needed for `pnpm dev` (corepack/pnpm, Git, file
watchers) but no application sources. The repository is synced into `/opt/app`
for live iteration, and the container process runs the same entrypoint as
`pnpm dev` (`tsx src/index.ts`). Production images continue to be built by the
existing CI pipeline and are separate from this workflow.

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
