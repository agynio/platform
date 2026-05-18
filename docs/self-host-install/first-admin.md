---
title: First admin
description: Claim the cluster admin role after install.
order: 4
---

# First admin

After installing Agyn, you need to bind the cluster admin role to your real OIDC user. The installer handles this in both install paths, but it is worth understanding the flow and how to recover if it does not happen automatically.

## How bootstrap handles it

Both `bootstrap` and the production `platform-charts` chart bind the first cluster admin the same way:

1. The installer provisions a **synthetic admin identity** with cluster admin authorization tuples in OpenFGA.
2. It creates a long-lived API token for that synthetic identity.
3. Using that token, it calls Gateway → Users service → `ProvisionUser` with your OIDC subject, email, and display name, and grants you `admin` on `cluster:global`.
4. After provisioning, the synthetic identity remains in the database but is no longer used. You can revoke its token later.

You provided the OIDC subject as `bootstrap.adminOidcSubject` in `values.yaml` (production) or it was inferred from your local test IdP (bootstrap).

## Verify

1. Open the Console.
2. Sign in with OIDC.
3. Click your avatar (top-right). If you see a context labeled **Cluster Administration**, you have the role.
4. Click into Cluster Administration → **Users** (`/users`). Find your account. The **Cluster Admin** column should be `Yes`.

If the role is missing, follow one of the recovery paths below.

## Recovery: I know the synthetic admin's API token

The installer prints the synthetic token at the end. If you still have it, you can grant yourself cluster admin manually:

```sh
agyn login --gateway https://gateway.agyn.example.com --token <synthetic-token>

agyn users grant-cluster-admin \
  --oidc-subject <your subject> \
  --email <your email> \
  --name "<your name>"
```

This creates your user record (if missing) and writes the `admin on cluster:global` tuple.

## Recovery: I lost the synthetic admin's token

The synthetic identity still exists in the database, but you cannot authenticate as it without the token. You have two options:

### Option A — re-run the bootstrap hook

The `platform-charts` chart exposes a Helm hook that re-runs the admin provisioning step. With a fresh `bootstrap.adminOidcSubject`:

```sh
helm upgrade agyn-platform agyn/platform \
  --namespace agyn \
  --values values.yaml \
  --set bootstrap.runAdminProvisioning=true \
  --set bootstrap.adminOidcSubject=<your subject>
```

This generates a new synthetic token and provisions you. After it finishes, unset `runAdminProvisioning` for future upgrades.

### Option B — apply a tuple directly

If you have access to the OpenFGA store, write the cluster admin tuple by hand. First, find your `identity_id`:

```sh
kubectl exec -it deployment/users -n agyn -- \
  psql $POSTGRES_DSN -c \
  "SELECT identity_id FROM users WHERE oidc_subject='<your subject>';"
```

If the row does not exist, provision the user record by signing into the Console once — first login auto-creates the user.

Then write the tuple to OpenFGA:

```sh
fga tuple write \
  --store-id $FGA_STORE_ID \
  identity:<identity_id> admin cluster:global
```

You will now have cluster admin on the next page load in the Console.

## What the cluster admin role grants

| Capability | Where it shows up |
|---|---|
| Manage platform users | Console → Cluster Administration → Users |
| Grant or revoke cluster admin to other users | Same view |
| Register cluster-scoped runners | Console → Cluster Administration → Runners |
| Manage cluster-scoped apps | Console → Cluster Administration → Apps |
| View all organizations | Context switcher lists every org |
| Inherit organization owner capabilities on every org | All org-level sections work without explicit membership |

Cluster admin is not the only path into the platform — for organization-scoped admin tasks, an organization owner role is enough.

## Hardening after first admin

1. Revoke the synthetic admin's API token. Sign in as yourself, navigate to **Users → synthetic-admin → Tokens**, and revoke. Alternatively, delete the token row directly in the Users service database.
2. Grant cluster admin to at least one backup user so you do not lock yourself out if your OIDC subject changes.
3. Document your cluster admin recovery procedure in your runbook.

## Related

- [Quick bootstrap](./quick-bootstrap.md)
- [Production install](./production-install.md)
- [Administer → Console overview](../administer/console-overview.md)
- [Operate → Identity](../operate/identity.md)
- [Operate → Authorization](../operate/authorization.md)
