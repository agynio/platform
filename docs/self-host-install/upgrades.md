---
title: Upgrades
description: Upgrade Agyn and run data migrations safely.
order: 5
---

# Upgrades

Agyn ships as a versioned set of Helm charts. Database migrations are owned by each service and run automatically on chart upgrade.

## Read the release notes

Every release includes notes describing breaking changes, new resources, and migration scope. Check them before upgrading any environment.

- Release notes live on the [`platform-charts` releases page](https://github.com/agynio/platform-charts/releases).
- Architectural deltas worth knowing about are tracked in the architecture repo under `changes/`.

## Pre-upgrade checks

1. **Take a fresh backup.** See [Operate → Backup & DR](../operate/backup-disaster-recovery.md). At minimum: Postgres dump + OpenFGA store export + S3 bucket inventory.
2. **Drain agent workloads.** New agent workloads should not start during a service rollout. Either pause the [Agents Orchestrator](../operate/architecture.md#agents-orchestrator) deployment or wait for a quiet period.
3. **Note current chart version.** `helm list -n agyn` to confirm.

## Upgrade

```sh
helm repo update
helm upgrade agyn-platform agyn/platform \
  --namespace agyn \
  --values values.yaml \
  --version <target-version>
```

The chart:

1. Applies new CRDs and Authorization model migrations.
2. Rolls each service one at a time. Each service runs its own DB migrations on startup before serving traffic.
3. Re-creates configuration that comes from chart values (e.g. Ziti service definitions).
4. Restarts deployments.

Watch progress:

```sh
watch kubectl get deploy -n agyn
```

A healthy rollout shows every deployment with `AVAILABLE == DESIRED` and no `CrashLoopBackOff` pods.

## Verify

After the upgrade:

1. Sign into the Console and check the cluster admin context loads.
2. Open an organization and confirm Agents, Runners, and Apps pages load.
3. Send a test message in an existing conversation. The agent should start, respond, and idle out as before.
4. Check Tracing for the new run.

If any of these fail, see [Rollback](#rollback).

## Resuming agent traffic

If you paused the Agents Orchestrator pre-upgrade:

```sh
kubectl scale deployment agents-orchestrator -n agyn --replicas=1
```

Agent workloads for any threads with unread messages will start within one reconciliation tick.

## Rollback

Helm rollback is safe as long as no destructive DB migrations ran in the new version. Release notes call out migrations that cannot be reverted.

```sh
helm rollback agyn-platform <previous-revision> -n agyn
```

If a destructive migration ran:

1. Stop all platform services.
2. Restore Postgres from your pre-upgrade backup.
3. Restore OpenFGA from its pre-upgrade export.
4. Re-deploy the previous chart version.

## Authorization model migrations

The OpenFGA authorization model is versioned separately from the platform chart. Upgrades that change the model run the new model version as part of the chart upgrade. Both versions remain queryable until you finalize the migration:

```sh
fga model write --store-id $FGA_STORE_ID --file new-model.json
```

The platform reads the latest model by default. Old tuples that referenced removed relations are migrated by the upgrade job — never delete tuples manually.

## Application upgrades

Apps (Reminders, Telegram Connector, third-party apps) upgrade independently. Each app's chart has its own release notes. Some apps share authorization tuples with the platform — read the app's release notes before upgrading across major versions.

## Runner upgrades

Cluster-scoped runners deployed with the platform upgrade automatically. Org-scoped runners deployed separately (in your own clusters or namespaces) need their own upgrade. Runner protocol compatibility is documented per release; you do not need to upgrade runners on every platform release.

## Related

- [Production install](./production-install.md)
- [Operate → Backup & DR](../operate/backup-disaster-recovery.md)
- [Operate → Upgrades](../operate/upgrades.md) — deeper operator view.
- [Reference → Versions](../reference/versions.md)
