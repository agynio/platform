---
title: Uninstall
description: Removing Agyn from your cluster.
order: 5
---

# Uninstall

Remove the release:

```sh
helm uninstall agyn-platform -n platform
```

That deletes what the chart created. Provisioned resources are left in place — an organization, image, app or runner is not destroyed by removing its declaration — while cluster administrator grants are revoked. Everything below outlives them, because the charts did not create it.

## What Helm leaves behind

### Persistent volumes

Claims for any bundled Postgres or object storage are not removed with the release — deliberately, so an uninstall is not a data-loss event. Delete them when you actually want the data gone:

```sh
kubectl -n platform get pvc
kubectl -n platform delete pvc <name>
```

External databases and buckets are untouched. Drop them yourself.

### OpenZiti state

Identities, services, and the policies from the [provisioning step](./install.md#3a-authorize-the-overlay) live in the OpenZiti controller, not in Kubernetes. If the controller stays, so do they — including a runner identity for a runner that no longer exists.

Remove the per-install entities, or the controller itself if it exists only for Agyn.

### Secrets you created

The runner service token, and any cluster-admin bootstrap credential:

```sh
kubectl -n platform delete secret k8s-runner-service-token
```

### Namespaces

```sh
kubectl delete namespace agyn-workloads
kubectl delete namespace platform
```

Delete `agyn-workloads` only once no agent workloads are still running in it.

## Partial teardown

To reinstall rather than remove, keep the databases, object storage, and OpenZiti state, and uninstall only the two releases. A reinstall then reconnects to existing data — but note one part of provisioning is **not** repeatable: a new runner enrollment mints a new token that must replace the old secret. Declared administrators are re-granted on reconcile.

## Related

- [Install](./install.md)
- [Operate → Backup & DR](../operate/backup-disaster-recovery.md)
