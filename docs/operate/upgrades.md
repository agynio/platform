---
title: Upgrades
description: Operator-facing concerns for rolling new versions out.
order: 8
---

# Upgrades

For the basic upgrade procedure, see [Self-host install → Upgrades](../self-host-install/upgrades.md). This page covers the operator concerns: rollout strategy, schema migrations, compatibility, rollback.

## Versioning

- Bootstrap pins every service to a specific chart version in `stacks/platform/variables.tf` (and `stacks/apps/variables.tf` for apps). A bootstrap revision is the unit of upgrade.
- Each service ships its own per-chart releases at `ghcr.io/agynio/charts/<service>`. They follow semantic versioning.
- The Authorization model is versioned separately; re-applying the `platform` stack writes the new model version before services restart.

Release notes call out:

- Breaking API changes (Gateway, internal RPCs).
- DB migrations and whether they are reversible.
- New required variables or values.
- New required dependencies (e.g. minimum Postgres version).

## Rollout strategy

Argo CD performs **rolling updates** per service:

- One pod at a time is replaced.
- Each new pod runs its DB migrations on startup before serving traffic.
- Services tolerate a small window of mixed versions — the API surface is designed to be backwards-compatible across one minor version.

For a higher-trust rollout:

- **Stage in a non-prod environment first.**
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

This means upgrading more than one minor version at a time is unsupported — you might land in the middle of a migration sequence with no clean state. Upgrade one minor version at a time across the multi-step sequences.

## Pre-upgrade checklist

1. **Read release notes for every version between current and target.**
2. **Take a fresh backup** (see [Backup & DR](./backup-disaster-recovery.md)).
3. **Note current bootstrap revision**: `git rev-parse HEAD` in the bootstrap clone.
4. **Snapshot current Argo CD app set**: `kubectl get applications -n argocd -o yaml > pre-upgrade-apps.yaml`.
5. **Pause Argo CD auto-sync on the affected apps** if you want the upgrade to be the only change in motion.
6. **Pause the Orchestrator** (recommended for major upgrades): `kubectl scale deploy agents-orchestrator -n agyn --replicas=0`.

## Upgrade

Pull the new bootstrap revision and re-apply:

```sh
cd bootstrap
git fetch
git checkout <target-revision>
./apply.sh
```

Argo CD reconciles each service to its new chart version. Watch:

```sh
watch kubectl get applications -n argocd
kubectl get pods -A --watch
```

Healthy upgrade: every Application is `Synced + Healthy`, every Deployment at full replicas.

## Verify

- Console loads. Org context switcher works.
- Send a test message in an existing conversation. Agent responds.
- Inspect a recent run in Tracing.
- Activity → Workloads shows the test workload.

If any of these fail, see [Rollback](#rollback).

## Resuming

If you paused the Orchestrator:

```sh
kubectl scale deploy agents-orchestrator -n agyn --replicas=1
```

Workloads for threads with unread messages start within one reconciliation tick.

If you paused Argo CD auto-sync, resume it.

## Rollback

For most patches and minor upgrades, check out the previous bootstrap revision and re-apply:

```sh
cd bootstrap
git checkout <previous-revision>
./apply.sh
```

Argo CD picks up the older chart versions and rolls services back. Pre-upgrade DB rollbacks aren't needed — backwards-compatible migrations stay applied.

For breaking schema migrations (called out in release notes), revision rollback is not enough:

1. Stop platform services.
2. Restore platform databases from your pre-upgrade backup.
3. Restore OpenFGA from its pre-upgrade backup if the model changed.
4. Re-deploy the previous bootstrap revision.

This is why pre-upgrade backups are non-negotiable.

## Authorization model migrations

Model changes are applied by re-applying the `platform` stack. The new model is written via the openfga provider as part of the stack apply, before any service pods that depend on the new shape restart. Old tuples that reference removed relations are migrated by the service that owns them — never delete tuples by hand.

Verify the active model:

```sh
fga model list --store-id <store-id>
```

The platform reads the latest model. Older models remain queryable for forensic purposes.

## Apps and runners

Apps (Reminders, Telegram Connector, your own) upgrade on their own cadence. Each app's chart has its own release notes. Bootstrap's `apps` stack pins versions for the platform-provided ones.

Runners likewise version independently. Runner protocol compatibility is documented per release; you typically don't need to upgrade runners on every platform release — only when release notes call for it.

## Argo CD considerations

If you manage Argo CD configuration outside bootstrap:

- Configure `automated: { selfHeal: false, prune: false }` during the upgrade window. Re-enable after.
- Use `syncOptions: [Replace=true]` carefully — Replace can re-create objects in ways the chart doesn't expect for hooks.
- Pre-sync hooks (e.g. migrations) run reliably with `helm.sh/hook` annotations on resources inside the per-service charts.

## Related

- [Self-host install → Upgrades](../self-host-install/upgrades.md)
- [Backup & DR](./backup-disaster-recovery.md)
- [Architecture overview](./architecture.md)
