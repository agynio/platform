---
title: First admin
description: How cluster admin is claimed at install, and how to recover it.
order: 3
---

# First admin

Nobody creates the first cluster admin: the **first account provisioned** claims the role. The Users service grants it during provisioning, then records the claim.

## The claim

`FIRST_ADMIN_EMAIL` narrows who can take it. Leave it unset and whoever signs in first owns the cluster — fine on a laptop, wrong for anything reachable. Set it, and only that address claims the role.

A configured address is honoured **only when the IdP marks it verified**. Without that check, anyone able to register under the operator's address would take the cluster. The practical consequence: if your IdP does not send `email_verified`, a configured address can never claim, and no one gets the role.

The claim is **one-shot**. It is a single record, deliberately not tied to the user — deleting the admin does not reopen it, and neither does deleting every admin.

## What the role grants

| Capability | Where it shows up |
|---|---|
| Manage platform users | Cluster Administration → Users |
| Grant or revoke cluster admin | same view |
| Register cluster-scoped runners | Cluster Administration → Runners |
| Oversee all organizations | Context switcher lists every org |
| Inherit owner-level access on every org | All org-level sections work without explicit membership |

## Verify

1. Open the Console and sign in.
2. Open the context switcher (top right). **Cluster Administration** should be listed.
3. Cluster Administration → **Users**: your account shows `Cluster Admin = yes`.

If it is missing, see [Recovery](#recovery).

## Create a second admin

Do this early. A single-admin cluster is one lost account away from the recovery procedure below.

Sign in as the existing admin, open Console → **Cluster Administration → Users**, find the second user, and toggle **Cluster Admin** on.

## Recovery

### You signed in but have no admin role

The claim went to another account, or `FIRST_ADMIN_EMAIL` is set and your IdP did not mark the address verified. Confirm the address is verified at the IdP, then grant the role from an existing admin account.

### No admin exists at all

Because the claim is one-shot, a later sign-in will not grant it. Grant the role directly:

1. Find the user's `identity_id` in the Users service database.
2. Write the tuple `identity:<identity_id>, admin, cluster:global` to the OpenFGA store.
3. Restart Authorization.

The role applies on the next page load.

### Non-interactively

If the install still has a cluster-admin bootstrap credential configured (see [Install → Automating this instead](./install.md#automating-this-instead)), it can be used as a bearer token against the Gateway to grant cluster admin to another identity.

## Hardening

1. Set `FIRST_ADMIN_EMAIL` before the platform is reachable, not after.
2. Create at least one backup cluster admin.
3. Remove any bootstrap credential once real admins exist.
4. Restrict who in your IdP can hold the admin address.

## Related

- [Install](./install.md)
- [Administer → Console overview](../administer/console-overview.md)
- [Operate → Identity](../operate/identity.md)
- [Operate → Authorization](../operate/authorization.md)
