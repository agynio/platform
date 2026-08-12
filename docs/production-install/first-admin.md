---
title: Cluster administrators
description: How cluster admin is declared at install, and how to recover it.
order: 3
---

# Cluster administrators

Cluster admin is **declared, not claimed**. The install names the people who
administer it, by the address their identity provider asserts, and the platform
controller grants the role once an account with that address exists.

Nobody is granted the role for signing in first, and an install that names no
administrator has none.

## Declaring one

Name each administrator under `provisioning.clusterAdmins` in the umbrella
values:

```yaml
provisioning:
  clusterAdmins:
    - address: operator@example.com
```

Each entry renders a `ClusterAdmin` object, which the controller reconciles:

```yaml
apiVersion: platform.agyn.io/v1alpha1
kind: ClusterAdmin
spec:
  address: operator@example.com
```

The grant is an authorization tuple written through the platform API, so it
survives a restart and is visible to every service that checks it.

**Removing a declaration revokes the role.** This is the one declaration that
does not orphan what it created — an unrevokable grant is a hole rather than a
resource.

## Before the first sign-in

An account exists only after its owner signs in, so a declaration made before
that has nothing to grant against. It stays pending and is retried:

```console
$ kubectl -n <namespace> get clusteradmin
NAME                 ADDRESS                READY   AGE
admin-278f97081067   operator@example.com   False   2m
```

```console
$ kubectl -n <namespace> get clusteradmin admin-278f97081067 \
    -o jsonpath='{.status.conditions[0].message}'
no account for "operator@example.com" yet; the grant completes when they first sign in
```

Signing in completes the declaration rather than triggering it. Ready turns true
on the next reconcile, and `status.identityIds` records what was granted:

```console
$ kubectl -n <namespace> get clusteradmin -o wide
NAME                 ADDRESS                READY   IDENTITIES
admin-278f97081067   operator@example.com   True    ["1aeb7409-…"]
```

## When an address names several accounts

`identityIds` is a list because one address can name more than one account. An
account is keyed on the subject its identity provider asserts, so **changing
provider leaves the same person holding a new account while the old one still
carries the address**.

A declaration names a person rather than a row, so it grants to every account
for the address. The abandoned one keeps a role nothing can authenticate; the
account the person actually signs into gets what was declared.

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

Do this early. A single-admin cluster is one lost account away from the recovery
procedure below.

Either add a second entry to `provisioning.clusterAdmins`, which is the
reproducible form and survives a reinstall, or — as an existing admin — open
Console → **Cluster Administration → Users**, find the user and toggle **Cluster
Admin** on. A role granted through the Console is not written back to the
declarations, so a rebuilt cluster will not have it.

## Recovery

### You signed in but have no admin role

Check the declaration rather than the account:

```console
$ kubectl -n <namespace> get clusteradmin -o wide
```

`Ready=False` names the reason. Pending means no account holds that address yet
— confirm the address your provider actually asserts matches the one declared,
which is the usual mismatch. No object at all means the install never declared
you: add the entry and upgrade.

### No admin exists at all

Add a declaration and upgrade the release. There is no race to lose and nothing
one-shot to exhaust — the grant lands as soon as the controller reconciles.

If the platform API is unreachable and the role is needed to repair it, the
tuple can be written directly as a last resort:

1. Find the user's `identity_id` in the Users service database.
2. Write the tuple `identity:<identity_id>, admin, cluster:global` to the OpenFGA store.
3. Restart Authorization.

Prefer the declaration. A tuple written by hand is invisible to
`provisioning.clusterAdmins`, so nothing revokes it and a rebuilt cluster will
not reproduce it.

### Non-interactively

If the install still has a cluster-admin bootstrap credential configured (see
[Install → Automating this instead](./install.md#automating-this-instead)), it
can be used as a bearer token against the Gateway to grant cluster admin to
another identity. This is the same credential the platform controller presents,
and it carries the same caveat as writing the tuple by hand: no declaration
accounts for the result.

## Hardening

1. Declare administrators in the values the install is built from, so a rebuild reproduces them.
2. Declare at least two, and keep a second account able to sign in.
3. Remove any bootstrap credential once real admins exist.
4. Restrict who in your identity provider can hold a declared address — the address is the whole of the claim, so anyone your provider lets assert it becomes an administrator.

## Related

- [Install](./install.md)
- [Administer → Console overview](../administer/console-overview.md)
- [Operate → Identity](../operate/identity.md)
- [Operate → Authorization](../operate/authorization.md)
