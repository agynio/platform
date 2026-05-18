---
title: Uninstall
description: Remove Agyn cleanly.
order: 6
---

# Uninstall

Uninstalling Agyn removes the platform services. It does not remove your data unless you explicitly delete it.

## Bootstrap

```sh
cd bootstrap
./destroy.sh
```

This removes the k3d cluster, hosts entries, and any local state. Docker volumes are removed with the cluster.

## Production

The order matters — apps depend on the platform, the platform depends on OpenFGA and OpenZiti.

### 1. Drain agent workloads

Stop new workloads from starting:

```sh
kubectl scale deployment agents-orchestrator -n agyn --replicas=0
```

Wait for existing workloads to finish or stop them:

```sh
kubectl delete pods -n agyn -l app=agent --grace-period=30
```

### 2. Uninstall apps

```sh
helm uninstall agyn-telegram -n agyn
helm uninstall agyn-reminders -n agyn   # if installed separately
```

### 3. Uninstall the platform

```sh
helm uninstall agyn-platform -n agyn
```

This deletes the platform Deployments, Services, ConfigMaps, and Helm-owned Secrets. It does not delete the namespace, your user-managed Secrets (DSNs, OIDC, S3, Ziti credentials), or any PersistentVolumeClaims.

### 4. Uninstall OpenFGA and OpenZiti

If you installed these only for Agyn:

```sh
helm uninstall openfga -n openfga
# OpenZiti teardown depends on your install path — see OpenZiti docs.
```

### 5. Delete the namespace (optional)

```sh
kubectl delete namespace agyn
```

This removes anything left behind — PVCs, leftover Secrets, etc.

### 6. Drop databases (optional)

Agyn does not drop databases on uninstall. If you want to fully reset:

```sh
psql -h $POSTGRES_HOST -U postgres -c "DROP DATABASE agyn_threads;"
psql -h $POSTGRES_HOST -U postgres -c "DROP DATABASE agyn_users;"
# ... and so on for every Agyn database.
```

OpenFGA stores live in the OpenFGA Postgres database — drop that database to remove all authorization data.

### 7. Empty the S3 bucket (optional)

Files uploaded to conversations live in S3. Empty the bucket if you want a clean state:

```sh
aws s3 rm s3://your-agyn-bucket --recursive
```

## What's left behind

Even after `helm uninstall`, the following persist unless you explicitly remove them:

- Your Postgres databases (services + OpenFGA).
- The S3 bucket and its contents.
- OpenZiti identities and services (if your OpenZiti deployment is shared).
- Your OIDC client registration in your IdP.
- TLS certificates issued by cert-manager (the Secrets are removed but the issued certificates may still be cached).

This is intentional — a partial uninstall should not be destructive.

## Related

- [Production install](./production-install.md)
- [Operate → Backup & DR](../operate/backup-disaster-recovery.md)
