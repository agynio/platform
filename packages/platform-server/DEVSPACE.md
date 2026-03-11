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

## How it works

DevSpace uses the ArgoCD-managed deployment as the base, then overlays the dev
container and sync behavior:

1. If the `platform-server` ArgoCD Application exists in the `argocd`
   namespace, DevSpace disables auto-sync to prevent ArgoCD from reverting the
   dev container changes.
2. DevSpace clones the deployment into a dev pod with the
   `ghcr.io/agynio/platform-server:dev` image.
3. The repo is synced into `/opt/app/data` (not a subdirectory, since the CRI
   creates subdirectories as root-owned `755`) and the startup script installs
   dependencies, generates protobuf and Prisma clients, and launches the dev
   server.
4. The dev pod overrides `GRAPH_REPO_PATH` to `/opt/app/data/graph` so the
   graph repository lives on the writable emptyDir mount.
5. On exit, the ArgoCD hook restores auto-sync for `platform-server`.

Port `3010` is forwarded locally, so the API should be reachable at
`http://localhost:3010` once the server reports ready.

## Start DevSpace

From the repository root:

```bash
cd packages/platform-server
devspace dev
```

Startup steps in the dev container (see
`packages/platform-server/scripts/devspace-startup.sh`):

1. `pnpm proto:generate`
2. `pnpm approve-builds @prisma/client prisma esbuild @nestjs/core`
3. `pnpm install --filter @agyn/platform-server... --frozen-lockfile`
4. `pnpm --filter @agyn/platform-server run prisma:generate`
5. `pnpm --filter @agyn/platform-server exec tsx watch src/index.ts`

## Prisma migrations

DevSpace generates Prisma client code but does not run migrations. If your
database schema is out of date, run migrations manually from your local
workstation (configure `AGENTS_DATABASE_URL` or `DATABASE_URL` as needed):

```bash
pnpm --filter @agyn/platform-server exec prisma migrate deploy
```

## Troubleshooting

- **Sync timeout waiting for `pnpm-workspace.yaml`**: DevSpace could not sync
  the repo in time. Check `devspace logs`, confirm your kubeconfig context, and
  run `devspace reset pods` before starting again.
- **ArgoCD keeps reverting changes**: Verify the ArgoCD Application exists in
  the `argocd` namespace and that auto-sync was disabled. Run
  `kubectl get application platform-server -n argocd` and restart the session
  if needed.
- **OOM kills**: The dev container is limited to 4Gi. Reduce memory usage or
  increase limits in the cluster if you consistently hit OOMs.

## Cleanup

Stop DevSpace with `Ctrl+C`. The ArgoCD hook restores automated syncing for the
`platform-server` application. If the dev pod sticks around, clean it up with:

```bash
devspace reset pods
```
