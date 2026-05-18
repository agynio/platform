---
title: Upgrades
description: How to roll out new versions safely.
order: 8
---

# Upgrades

For the basic upgrade procedure, see [Self-host install → Upgrades](../self-host-install/upgrades.md). This page covers the operator-specific concerns: rollout strategy, schema migrations, version compatibility, and what to do when something goes wrong.

## Versioning

- The platform follows **semantic versioning** at the chart level: major / minor / patch.
- Each service has its own version, pinned by the chart. Mixing service versions outside what the chart pins is unsupported.
- The Authorization model is versioned separately; chart upgrades that change the model write a new model version before rolling the dependent services.

Release notes call out:

- Breaking API changes (Gateway, internal RPCs).
- DB migrations and whether they are reversible.
- New required Helm values.
- New required dependencies (e.g. minimum Postgres version).

## Rollout strategy

The platform chart uses **rolling updates** per service by default:

- One pod at a time is replaced.
- Each new pod runs its DB migrations on startup before serving traffic.
- Services tolerate a small window of mixed versions — the API surface is designed to be backwards-compatible across one minor version.

For a higher-trust rollout, you can:

- **Stage to a separate environment** first (e.g. `staging` cluster, then `prod`).
- **Pause the Orchestrator** before upgrading to prevent new workloads from starting mid-upgrade.
- **Drain runners** so existing workloads complete before the upgrade.

## Schema migrations

Most migrations are zero-downtime:

- Additive — new columns, new tables, new indexes (concurrent).
- Backwards-compatible — old service version can read the new schema.

Backwards-incompatible migrations exist (column renames, dropped tables, non-null adds without defaults). These are called out explicitly in release notes and are spread across multiple releases:

1. Release N: add new column, dual-write to old and new, application reads from old.
2. Release N+1: application reads from new, dual-writes continue.
3. Release N+2: drop old column.

This means upgrading more than one minor version at a time is unsupported — you might land in the middle of a migration sequence with no clean state. Always upgrade one minor version at a time across the multi-step migrations.

## Pre-upgrade checklist

1. **Read release notes for every version between current and target.**
2. **Take a fresh backup** (see [Backup & DR](./backup-disaster-recovery.md)).
3. **Snapshot of Helm values**: `helm get values agyn-platform -n agyn > pre-upgrade-values.yaml`.
4. **Snapshot of current versions**: `helm list -n agyn`.
5. **Pause Argo CD auto-sync** if you use it, so the upgrade is the only change in motion.
6. **Pause Orchestrator** (optional but recommended for major upgrades): `kubectl scale deploy agents-orchestrator -n agyn --replicas=0`.

## Upgrade

```sh
helm repo update
helm upgrade agyn-platform agyn/platform \
  --namespace agyn \
  --values values.yaml \
  --version <target>
```

Watch:

```sh
watch kubectl get deploy,statefulset -n agyn
kubectl get pods -n agyn --watch
```

Healthy upgrade: every deployment hits `AVAILABLE == DESIRED`, no `CrashLoopBackOff`, no pods stuck `Init`.

## Verify

- Console loads. Org context switcher works.
- Send a test message in an existing conversation. Agent responds.
- Inspect a recent run in Tracing.
- Activity → Workloads shows the test workload.

If any verification fails, see [Rollback](#rollback).

## Resuming

If you paused the Orchestrator:

```sh
kubectl scale deploy agents-orchestrator -n agyn --replicas=1
```

Workloads for threads with unread messages start within one reconciliation tick.

If you paused Argo CD auto-sync, resume it.

## Rollback

For most patches and minor upgrades:

```sh
helm rollback agyn-platform <previous-revision> -n agyn
```

This re-deploys the previous version. Pre-upgrade DB rollbacks aren't needed — backwards-compatible migrations stay applied.

For breaking schema migrations (called out in release notes), Helm rollback isn't enough:

1. Stop platform services.
2. Restore the platform databases from your pre-upgrade backup.
3. Restore OpenFGA from its pre-upgrade backup if the model changed.
4. Re-deploy the previous chart version.

This is why pre-upgrade backups are non-negotiable.

## Authorization model migrations

Model changes ship as a Helm pre-upgrade hook. The new model is written before service pods are upgraded. Old tuples that reference removed relations are migrated by the upgrade job — never delete tuples by hand.

You can verify the active model:

```sh
fga model list --store-id $FGA_STORE_ID
```

The platform reads the latest model. Older models remain queryable for forensic purposes.

## Apps and runners

Apps (Reminders, Telegram Connector, your own) upgrade on their own cadence. Each app's chart has its own release notes.

Runners likewise upgrade independently. Runner protocol compatibility is documented per release. You typically don't need to upgrade runners on every platform release — only when release notes call for it.

## Argo CD considerations

If you use Argo CD to manage the platform chart:

- Configure `automated: { selfHeal: false, prune: false }` during the upgrade window. Re-enable after.
- Use `syncOptions: [Replace=true]` carefully — Replace can re-create objects in ways the chart doesn't expect for hooks.
- Pre-sync hooks run reliably with `helm.sh/hook` annotations.

## Related

- [Self-host install → Upgrades](../self-host-install/upgrades.md)
- [Backup & DR](./backup-disaster-recovery.md)
- [Architecture overview](./architecture.md)
