# DevSpace workflow for platform-server

This guide explains how to replace the Argo CD managed `platform-server`
deployment with a locally built image while developing against the
`bootstrap_v2` Kubernetes cluster.

## Prerequisites

- macOS or Linux workstation with Docker (or k3d) installed
- [`kubectl`](https://kubernetes.io/docs/tasks/tools/)
- [`helm`](https://helm.sh/docs/intro/install/)
- [`devspace`](https://devspace.sh/docs/cli/installation)
- [`argocd` CLI](https://argo-cd.readthedocs.io/en/stable/cli_installation/) (or
  access to Argo CD UI)
- `agynio/bootstrap_v2` repository cloned locally

## 1. Bootstrap the local cluster

1. Follow the instructions in `bootstrap_v2/README.md` to initialise the k3d
   cluster (or targeted environment) and create the `~/.kube` entry.
2. Apply the Terraform stacks in order:
   ```bash
   cd bootstrap_v2/stacks/k8s && terraform init && terraform apply
   cd ../system && terraform init && terraform apply
   cd ../platform && terraform init && terraform apply
   ```
3. Point `kubectl` and DevSpace at the generated kubeconfig (the default path
   is `bootstrap_v2/k8s/.kube/agyn-local-kubeconfig.yaml`):
   ```bash
   export KUBECONFIG="$(pwd)/bootstrap_v2/k8s/.kube/agyn-local-kubeconfig.yaml"
   kubectl config use-context agyn-local
   ```
4. Confirm the `platform` namespace exists:
   ```bash
   kubectl get ns platform
   ```

## 2. Pause Argo CD reconciliation

Argo CD continually reconciles the `platform-server` Application. Suspend it to
avoid clobbering DevSpace deployments:

```bash
argocd app set platform-server --sync-policy none
argocd app terminate-op platform-server || true
```

> If you cannot use the Argo CLI, patch the Application directly:
> ```bash
> kubectl patch application platform-server -n argocd \
>   --type merge -p '{"spec":{"syncPolicy":null}}'
> ```

Record the current automated settings so you can restore them during cleanup.

## 3. Build & deploy with DevSpace

From `packages/platform-server` run:

```bash
devspace dev -n platform
```

The default workflow builds the Docker image, deploys the Helm chart release
`platform-server-dev`, forwards port `3010`, and syncs the package sources into
the container. The chart values point all dependencies to in-cluster services
(`platform-db`, `litellm`, `vault`, `docker-runner`) and mount ephemeral
volumes at `/tmp` and `/opt/app/packages/platform-server/data`.

### Hot-reload profile

Use the `hot-reload` profile to start `tsx watch` inside the container:

```bash
devspace dev -n platform -p hot-reload
```

This profile keeps the watcher running in the foreground so code edits trigger
live reloads after sync completes.

### Debug profile

Expose the Node.js inspector and start the server under `node --inspect`:

```bash
devspace dev -n platform -p debug
```

Then attach your debugger to `localhost:9229`.

### Importing the image into k3d

When using k3d without a registry mirror, import the image into the cluster as
part of the workflow:

```bash
devspace dev -n platform -p k3d-import
```

Profiles may be combined, e.g. `-p k3d-import,hot-reload`.

### Remote registry profile (optional)

To publish the dev image to GHCR (or another registry you configure), use the
`remote-registry` profile. Authenticate to the registry first, then run:

```bash
devspace dev -n platform -p remote-registry
```

Override `images.platform-server.image` in `devspace.yaml` if you need a
different registry path.

## 4. Verify the deployment

1. Check the dev pod is ready:
   ```bash
   kubectl -n platform get pods -l app.kubernetes.io/name=platform-server
   ```
2. Port-forward the service and query the API:
   ```bash
   kubectl -n platform port-forward svc/platform-server 3010:3010
   curl http://localhost:3010/healthz
   ```
3. Confirm Postgres, LiteLLM, Vault, and the Docker runner are reachable from
   the pod logs (DevSpace streams them automatically). Authentication material
   for LiteLLM is read from the `litellm-master-key` secret; update the
   `DOCKER_RUNNER_SHARED_SECRET` variable in `devspace.yaml` if your cluster
   uses a non-default value.

### Prisma migrations

The DevSpace chart injects a `platform-server-migrations` initContainer that
executes `pnpm exec prisma migrate deploy` against `platform-db`. If you need to
rerun migrations manually, exec into the pod and run:

```bash
kubectl -n platform exec deploy/platform-server-dev -- \
  corepack pnpm --dir /opt/app/packages/platform-server exec prisma migrate deploy
```

## 5. Cleanup & restore Argo CD

1. Terminate the DevSpace session (`Ctrl+C`).
2. Remove the dev release and synced resources:
   ```bash
   devspace purge -n platform
   ```
3. Resume Argo CD automation (restore the values captured earlier):
   ```bash
   argocd app set platform-server --sync-policy automated --self-heal --prune
   argocd app sync platform-server
   ```
   or, if patching directly:
   ```bash
   kubectl patch application platform-server -n argocd \
     --type merge \
     -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true,"allowEmpty":false}}}}'
   ```

After Argo regains control, the managed deployment should reconcile back to the
Git revision set in `bootstrap_v2`.
