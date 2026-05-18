---
title: Install issues
description: Bootstrap or production install failed, services won't come up.
order: 1
---

# Install issues

## Bootstrap

### `./apply.sh` fails immediately

- **Docker not running.** Start Docker Desktop / dockerd.
- **Insufficient resources.** Docker needs at least 4 vCPU and 8 GB RAM allocated. On macOS Settings → Resources, bump the values.
- **Port 2496 or 6443 already in use.** Stop whatever is using them (`lsof -i :2496`) or change k3d's port mapping.

### k3d cluster comes up but pods stay `Pending`

```sh
kubectl describe pod -n agyn <pod>
```

Look at the **Events** at the bottom. Usually:

- `Insufficient cpu` / `Insufficient memory` → bump Docker resources.
- `MountVolume.SetUp failed` → storage provisioning issue. Restart k3d.
- `ImagePullBackOff` → registry rate-limit (the default registry on Docker Hub throttles aggressively). Run `./apply.sh` again after a few minutes.

### Argo CD shows applications `OutOfSync` after install

```sh
kubectl get applications -n argocd
```

- For each `OutOfSync` app: `argocd app sync <name>` (or click Sync in the Argo CD UI).
- If sync keeps failing, look at the app's resource health: `argocd app get <name>`.

### Browser can't open `https://agyn.dev:2496/`

- `/etc/hosts` doesn't have `agyn.dev`. Bootstrap should have added it; check:
  ```sh
  grep agyn.dev /etc/hosts
  ```
  Expected lines map `127.0.0.1` to `agyn.dev`, `console.agyn.dev`, `chat.agyn.dev`, etc. Add them manually if needed.
- Certificate warnings are expected — they are self-signed for local development.

## Production

### `helm install` fails with `Error: ... required field`

Means a required value in `values.yaml` is missing. Cross-check against [Reference → Helm values](../reference/helm-values.md). Most common omissions:

- `global.domain`
- `oidc.existingSecret` (and the Secret itself)
- `postgres.existingSecret` (and the per-service DSN keys)

### Pods stuck in `Init:Error` or `CrashLoopBackOff`

```sh
kubectl describe pod -n agyn <pod>
kubectl logs -n agyn <pod> -c <container>
```

Common causes:

- **Cannot connect to PostgreSQL.** Wrong DSN in the Secret, network policy blocking, Postgres unreachable from the cluster.
- **Cannot connect to OpenFGA.** Wrong URL or token in `agyn-platform-openfga` Secret, OpenFGA not running.
- **Cannot connect to Ziti Controller.** Wrong URL or cert in `agyn-platform-ziti` Secret.
- **OIDC discovery fails.** Wrong issuer URL or the IdP is unreachable. Check `agyn-platform-oidc`.

### `agents-orchestrator` is the only pod restarting

The Orchestrator runs leader-elected with multiple replicas. Restarts on first deployment are normal as leadership is established. If it keeps restarting:

```sh
kubectl logs -n agyn deploy/agents-orchestrator --tail=100
```

Most often: the Runners service is unreachable. The orchestrator needs Runners up.

### `gateway` returns 502 immediately after install

Gateway depends on most services. If any are unhealthy, Gateway can fail readiness probes.

```sh
kubectl get pods -n agyn
```

Wait for everything to show `Ready 1/1` before assuming Gateway is broken. First-time installs typically take 5-10 minutes for all images to pull and migrations to complete.

## Image pull failures

If any pod shows `ImagePullBackOff`:

```sh
kubectl describe pod -n agyn <pod>
```

Look at the **Events**:

- `unauthorized: authentication required` → you're pulling from a private registry without credentials. Add an image pull secret to the pod's namespace and reference it in the chart values (`global.imagePullSecrets`).
- `manifest unknown` → the image tag doesn't exist. Check the chart's expected image version against what's published.
- `rate limited` → Docker Hub. Use a mirror or authenticated pulls.

For agent workloads pulling from your private registry: see [Administer → Image pull secrets](../administer/image-pull-secrets.md).

## Database migrations stuck

If a service is stuck in `Init` with a long-running migration job:

```sh
kubectl logs -n agyn job/<migration-job>
```

Migration jobs are idempotent — kill and let the chart re-create:

```sh
kubectl delete job -n agyn <migration-job>
helm upgrade agyn-platform agyn/platform -n agyn --reuse-values
```

If the migration fails on a constraint that doesn't apply to your DB state (rare but happens during major upgrades), check release notes for known migration issues. If none, file a GitHub issue.

## Related

- [Self-host install → Prerequisites](../self-host-install/prerequisites.md)
- [Self-host install → Production install](../self-host-install/production-install.md)
- [Operate → Logging & audit](../operate/logging-audit.md)
- [Operate → Monitoring](../operate/monitoring.md)
