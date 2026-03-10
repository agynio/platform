# DevSpace workflow for platform-server

Use DevSpace to attach to the ArgoCD-managed `platform-server` deployment in
the `bootstrap_v2` cluster and run the development image with live sync.

## Prerequisites

- macOS or Linux workstation with Docker and `kubectl` installed
- [`devspace`](https://devspace.sh/docs/cli/installation)
- Local cluster provisioned via
  [`agynio/bootstrap_v2`](https://github.com/agynio/bootstrap_v2). Export the
  kubeconfig path from the Quickstart (for example:
  `export KUBECONFIG=bootstrap_v2/k8s/.kube/agyn-local-kubeconfig.yaml`).

## Start DevSpace

From the repository root:

```bash
cd packages/platform-server
devspace dev
```

DevSpace temporarily disables ArgoCD auto-sync for the `platform-server`
application before starting the dev session and restores it when you exit. It
uses the `ghcr.io/agynio/platform-server:dev` image, syncs the repository into
`/opt/app/data/workspace`, and runs the following startup flow:

1. `pnpm proto:generate`
2. `pnpm approve-builds @prisma/client prisma esbuild @nestjs/core`
3. `pnpm install --filter @agyn/platform-server... --frozen-lockfile`
4. `prisma generate`
5. `pnpm dev`

Port `3010` is forwarded locally, so the API should be reachable at
`http://localhost:3010` once the server reports ready.

## Cleanup

Stop DevSpace with `Ctrl+C`. The ArgoCD auto-sync hook will restore automated
syncing for the `platform-server` application.
