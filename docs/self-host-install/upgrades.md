---
title: Upgrades
description: How to upgrade the platform installed via bootstrap.
order: 5
---

# Upgrades

Bootstrap pins every service to a specific Helm chart version in the `platform` stack's locals. Upgrading means: pull a newer bootstrap revision (or bump the versions yourself), re-run `apply.sh`, and let Argo CD reconcile.

There is no single `helm upgrade agyn-platform` step today — upgrades are stack-by-stack, service-by-service. A centralized umbrella chart at [`agynio/platform-charts`](https://github.com/agynio/platform-charts) is in preparation and will eventually replace per-service deployment in bootstrap; it is not used today.

## Read the release notes

Every meaningful change to the bootstrap or to a platform service ships with notes on the relevant repository:

- Bootstrap-level: [`agynio/bootstrap`](https://github.com/agynio/bootstrap) commits and releases.
- Per-service: each `agynio/<service>` repository has its own releases.
- Architecture changes are tracked in [`agynio/architecture`](https://github.com/agynio/architecture) under `changes/`.

Check them before upgrading.

## Pre-upgrade checks

1. **Take a fresh backup.** See [Operate → Backup & DR](../operate/backup-disaster-recovery.md). At minimum: Postgres dumps + OpenFGA store export.
2. **Drain agent workloads.** New workloads shouldn't start during a service rollout. Either pause the [Agents Orchestrator](../operate/architecture.md#agents-orchestrator) deployment or wait for a quiet period.
3. **Note the current state.** `git rev-parse HEAD` in the bootstrap clone, and `helm list -A` for service versions in the cluster.

## Upgrade

```sh
cd bootstrap
git pull
./apply.sh
```

`apply.sh` re-applies every stack. Each stack's Terraform compares its declared chart version against what's in the cluster:

- **Platform service charts**: the `platform` stack updates Argo CD `Application` revisions. Argo CD pulls the new chart, applies it, and rolling-restarts the service. Each service runs its own DB migrations on startup.
- **Apps (Reminders, Telegram Connector, k8s-runner)**: the `apps` stack updates their Argo CD applications the same way.
- **Stacks that build CRDs or core infrastructure** (Istio, OpenZiti, cert-manager): only re-applied if their versions changed in the corresponding stack.

Watch progress in Argo CD: `https://argocd.agyn.dev:2496/`. Each `Application` flips from `Progressing` to `Synced + Healthy`.

You can also watch from the cluster:

```sh
watch kubectl get applications -n argocd
watch kubectl get deploy -A
```

A healthy upgrade ends with every Application `Synced + Healthy` and every Deployment at full replicas.

## Verify

After the rollout:

1. Sign in to the Console.
2. Open an organization and confirm Agents, Runners, and Apps pages load.
3. Send a test message in an existing conversation. The agent should start, respond, and idle out.
4. Check Tracing for the new run.

If any of these fail, see [Rollback](#rollback).

## Resuming agent traffic

If you scaled the Agents Orchestrator down for the upgrade:

```sh
kubectl scale deploy agents-orchestrator -n agyn --replicas=1
```

Agent workloads for any threads with unread messages will start within one reconciliation tick.

## Rollback

For most patches and minor service upgrades, you can roll back by checking out the previous bootstrap revision and re-applying:

```sh
git checkout <previous-revision>
./apply.sh
```

Argo CD picks up the older chart versions and rolls services back. Each service's DB migrations are designed to be backwards-compatible within one minor version — but **destructive migrations exist** and are called out in service release notes. If a release ran a non-reversible migration, Helm/Argo CD rollback alone is not enough:

1. Stop the affected services.
2. Restore Postgres / OpenFGA from your pre-upgrade backup.
3. Re-deploy the previous revision.

This is why pre-upgrade backups are non-negotiable.

## Per-service upgrades

If you want to upgrade a single service (e.g. patch a hotfix without touching the rest), edit the version in `stacks/platform/main.tf` or the per-service variables, then run only the `platform` stack:

```sh
terraform -chdir=stacks/platform apply
```

Argo CD reconciles only the changed Application.

## Authorization model migrations

The OpenFGA authorization model ships with the `platform` stack. When a release changes the model, re-applying the platform stack writes the new model version. Old tuples that reference removed relations are migrated by the service that owns them — never delete tuples by hand.

You can verify the active model:

```sh
fga model list --store-id <store-id>
```

Get the store ID from `https://openfga.agyn.dev:2496/` or the Authorization deployment's environment.

## Production considerations

For production installs:

- Maintain separate Terraform state per environment (`backend "s3" {}` or similar).
- Stage upgrades in a non-prod environment first.
- Use `-target` to roll a single stack if you need surgical changes.
- Document your rollback drill — it's much faster than reading these docs at 3 AM.

## Related

- [Quick bootstrap](./quick-bootstrap.md)
- [Production install](./production-install.md)
- [Uninstall](./uninstall.md)
- [Operate → Backup & DR](../operate/backup-disaster-recovery.md)
- [Operate → Upgrades](../operate/upgrades.md)
