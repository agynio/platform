---
title: Backup & disaster recovery
description: Postgres, OpenFGA, S3, persistent volumes — what to back up and how to restore.
order: 7
---

# Backup & disaster recovery

The platform's durable state lives in four places. Each needs its own backup strategy. Volumes have a fifth, looser strategy.

| Store | What's in it | Recovery shape |
|---|---|---|
| PostgreSQL (platform databases) | Users, identities, organizations, agents, threads, runners, tracing, metering | Point-in-time recovery (PITR). |
| PostgreSQL (OpenFGA store) | Authorization tuples | Plain dump + restore is sufficient. |
| S3 (Files bucket) | User-uploaded files | Cross-region replication or versioning. |
| Persistent Volumes (agent state) | Per-thread working state | Best-effort — losing them disrupts in-progress conversations. |

## PostgreSQL — platform databases

### Backup

- **Continuous WAL archiving** to S3 or your DR target. Required for PITR.
- **Daily logical dumps** (`pg_dump`) as a secondary, slower-to-restore copy. Good for "I deleted a row" recovery.
- **Encrypt backups at rest.** Whatever your provider offers (S3 SSE, GCS encryption, etc.).

For managed databases (RDS, Cloud SQL, etc.), enable PITR and automated snapshots. For self-managed, use `wal-g` or `pgbackrest`.

### Restore

PITR restore to a target time:

1. Restore the base backup nearest to the target time.
2. Replay WAL up to the target.
3. Point each service's `DATABASE_URL` at the restored instance.
4. Restart services.

If you only need a few tables (e.g. you accidentally truncated `threads.messages`), restore to a side instance, then copy the rows over with `pg_dump --table` and `pg_restore`.

### Per-service databases

Each platform service owns its database. You can restore individual databases independently. But:

- **Identity, Users, Organizations, Authorization** are mutually consistent — restore them as a group, to the same point in time, to avoid orphaned references.
- **Threads, Tracing, Metering, Agents, Runners** can be restored independently of the identity-set group, but in practice you'll want them at the same time.

## PostgreSQL — OpenFGA

OpenFGA's PostgreSQL holds authorization tuples. Critical — if you lose it, every authorization check fails (or worse, succeeds unintentionally).

Backup strategy:

- Same as platform databases: continuous WAL archiving + daily dumps.

Restore strategy:

- Restore the database.
- Re-deploy the authorization model (`fga model write` is idempotent — the same model produces the same model_id).
- Restart OpenFGA. The Authorization service reconnects automatically.

If only the model is lost (tuples intact), re-apply the model. Tuples reference the model by ID and may need re-migration — see release notes for any version where this is non-trivial.

## S3 — Files bucket

The Files service stores uploaded files keyed by `file_id`. File metadata lives in the `files` PostgreSQL database.

Backup strategy:

- Enable **bucket versioning** to recover from accidental deletes.
- Enable **cross-region replication** for disaster recovery.
- Lifecycle rules to expire old object versions (your call — files referenced by recent threads should be retained).

Restore strategy:

- Restore the bucket to its desired state (via replication failover or object version restore).
- File metadata in Postgres references files by ID — if the metadata exists but the object doesn't, downloads fail with 404. The platform does not auto-clean missing files.

## Persistent volumes — agent state

Agent volumes hold per-thread working state. They're transient by design but disruptive to lose mid-conversation.

Backup strategy:

- **VolumeSnapshots** if your CSI driver supports them. Schedule daily.
- Treat them as **best-effort** — agents are expected to handle reboot/restart by re-reading conversation history.

Restore strategy:

- Restore VolumeSnapshots → PVCs.
- The orchestrator's volume reconciliation re-attaches PVCs on next workload start.

If you can't restore a volume:

- The orchestrator provisions a fresh PVC on next start.
- The agent loses any unsaved working state but continues from the conversation transcript.

For most use cases this is acceptable. For long-lived agents with expensive volume state (large checkouts, learned data), more aggressive volume backup is worth setting up.

## DR drills

Schedule a quarterly DR drill:

1. Pick a "lost" component (a database, a region).
2. Restore in your DR environment.
3. Run a synthetic conversation through the restored platform.
4. Record the time-to-recover.

The first drill is always slower than you expect. Use it to refine runbooks, automate restore steps, and validate backup integrity.

## What you don't back up

- **Redis** — purely ephemeral (pub/sub state, short-lived caches). No backup needed.
- **Kubernetes Secrets** — back up the credentials separately (in your secret manager or a Vault snapshot). Don't rely on etcd backups for sensitive material.
- **OpenZiti state** — for managed OpenZiti this is the provider's concern. For self-hosted, see the OpenZiti DR documentation.

## RPO and RTO

Set targets and back into a backup configuration:

| Metric | Default target | Adjust by |
|---|---|---|
| RPO (data loss tolerance) | 5 minutes | Setting WAL archiving frequency. |
| RTO (recovery time) | 1 hour | Pre-staging restore tooling, automating runbooks. |

For organizations with stricter requirements, consider warm standbys (continuous replication to a separate region) instead of cold backups.

## Related

- [Architecture overview](./architecture.md) — what data each service owns.
- [Upgrades](./upgrades.md) — DB migrations and rollback.
- [Security](./security.md)
