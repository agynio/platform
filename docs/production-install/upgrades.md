---
title: Upgrades
description: Moving a chart install between versions.
order: 4
---

# Upgrades

An upgrade is a chart version bump:

```sh
helm upgrade agyn-platform oci://ghcr.io/agynio/charts/agyn-platform \
  --version <new> -n platform -f values-platform.yaml
```

One release moves everything: the runner and the bundled apps ship in `agyn-platform`, and provisioning re-runs against what the new release declares.

## Before you upgrade

**Re-read the [prerequisites](./prerequisites.md) when the minor version moves.** A new chart version can bundle a dependency that did not exist before. Every bundled dependency is off unless your values switch it on, so an upgrade will not deploy a second Postgres behind your back — but a dependency you do want still has to be named.

**Check what your values still line up with.** Value paths move between versions. A setting that no longer matches anything is silently ignored rather than rejected, so the symptom is a component quietly reverting to its default.

The safest check is to render both versions against your own values and compare:

```sh
helm template agyn-platform oci://ghcr.io/agynio/charts/agyn-platform \
  --version <current> -f values-platform.yaml > before.yaml
helm template agyn-platform oci://ghcr.io/agynio/charts/agyn-platform \
  --version <new> -f values-platform.yaml > after.yaml
diff before.yaml after.yaml
```

Anything added, removed, or changed that you did not intend is a value that needs updating before you apply.

## What does not need repeating

The [provisioning step](./install.md#3-provisioning) is not part of an upgrade:

- Overlay policies persist in the OpenZiti controller.
- The runner stays enrolled, and its service token stays valid.
- Administrators are declared, so they are re-granted rather than re-claimed.

## Read the release notes

- Chart changes: [`agynio/platform-charts`](https://github.com/agynio/platform-charts).
- Per-service changes: each `agynio/<service>` repository.
- Architecture changes: [`agynio/architecture`](https://github.com/agynio/architecture) under `changes/`.

## Rollback

```sh
helm rollback agyn-platform -n platform
```

Rollback restores manifests, not data. A release that ran a database migration cannot be undone by Helm — restore from backup instead. See [Operate → Backup & DR](../operate/backup-disaster-recovery.md).

## Related

- [Install](./install.md)
- [Prerequisites](./prerequisites.md)
- [Operate → Upgrades](../operate/upgrades.md)
