# DevSpace workflow for platform-ui

Use DevSpace to attach to the ArgoCD-managed `platform-ui` deployment in the
`bootstrap_v2` cluster and run the Vite dev server with live sync.

## Prerequisites

- macOS or Linux workstation with Docker and `kubectl` installed
- [`devspace`](https://devspace.sh/docs/cli/installation)
- Local cluster provisioned via
  [`agynio/bootstrap_v2`](https://github.com/agynio/bootstrap_v2) (the
  `apply.sh` script merges the kubeconfig into `~/.kube` automatically).

## How it works

DevSpace uses the ArgoCD-managed deployment as the base, patches it in place,
and then attaches sync/ports/logs:

1. If the `platform-ui` ArgoCD Application exists in the `argocd` namespace,
   DevSpace disables auto-sync to prevent ArgoCD from reverting the dev
   container changes.
2. The pipeline patches the existing `platform-ui` Deployment in place (image,
   security context, resources, command, env) so no clone is created.
3. DevSpace attaches to the patched deployment with
   `start_dev --disable-pod-replace` and only configures sync/ports/logs.
4. The repo is synced into `/opt/app/data` and the startup script installs
   dependencies, then launches the Vite dev server on `0.0.0.0:3000`.
5. The dev pod sets `VITE_API_BASE_URL` to `/api` so the UI makes same-origin
   requests; Vite proxies `/api` and `/socket.io` to
   `http://platform-server:3010` (or `VITE_PROXY_TARGET`).
6. On exit, the ArgoCD hook restores auto-sync for `platform-ui`.

Port `3000` is forwarded locally, so the UI should be reachable at
`http://localhost:3000` once Vite reports ready.

## Start DevSpace

From the repository root:

```bash
cd packages/platform-ui
devspace dev
```

Startup steps in the dev container (see
`packages/platform-ui/scripts/devspace-startup.sh`):

1. `pnpm install --filter @agyn/platform-ui... --frozen-lockfile`
2. `pnpm --filter @agyn/platform-ui exec vite --host 0.0.0.0 --port 3000`

## Troubleshooting

- **Sync timeout waiting for `pnpm-workspace.yaml`**: DevSpace could not sync
  the repo in time. Check `devspace logs`, confirm your kubeconfig context, and
  run `devspace reset pods` before starting again.
- **ArgoCD keeps reverting changes**: Verify the ArgoCD Application exists in
  the `argocd` namespace and that auto-sync was disabled. Run
  `kubectl get application platform-ui -n argocd` and restart the session if
  needed.
- **Old devspace clone still running**: If `platform-ui-devspace` exists from
  the previous workflow, delete it with
  `kubectl delete deployment platform-ui-devspace -n platform`.
- **OOM kills**: The dev container is limited to 2Gi. Reduce memory usage or
  increase limits in the cluster if you consistently hit OOMs.

## Cleanup

Stop DevSpace with `Ctrl+C`. The ArgoCD hook restores automated syncing for the
`platform-ui` application. If the dev pod sticks around, clean it up with:

```bash
devspace reset pods
```
