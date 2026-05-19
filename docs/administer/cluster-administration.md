---
title: Cluster administration
description: Manage platform users, cluster-scoped runners, and all organizations.
order: 2
---

# Cluster administration

This page covers tasks restricted to cluster admins. Switch to the **Cluster Administration** context in the Console (top-right context switcher) to access these views. If you do not see this context, you do not have the cluster admin role — see [Self-host install → First admin](../self-host-install/first-admin.md).

## Manage platform users

The Users page lists every user the platform has ever seen — anyone who has signed in via OIDC has a record.

### In the Console

1. Console → **Cluster Administration → Users** (`/users`).
2. The list shows name, username, email, org memberships, cluster admin status.
3. Click a user to open their detail page. From there you can:
   - **Grant or revoke cluster admin.**
   - View OIDC subject (read-only — set by the IdP).
   - See active sessions and API tokens.


Users are auto-provisioned on their first OIDC login. You do not create user records manually.

### With Terraform

User records are not Terraform-managed — they are created by OIDC sign-in. You can, however, write the cluster admin authorization tuple directly:

```hcl
resource "agyn_cluster_admin" "platform_admin" {
  identity_id = "<the user's identity_id>"
}
```

You can find a user's `identity_id` in the Console (Users → detail) or via `agyn users list`.

## Manage cluster-scoped runners

Cluster-scoped runners host workloads for every organization on the platform. Each organization can also register its own runners (see [Runners](./runners.md)); cluster runners are the shared pool.

### In the Console

1. Console → **Cluster Administration → Runners** (`/runners`).
2. Click **Register runner**.
3. Set:
   - **Name** — display name (e.g. `gpu-pool-eu-west-1`).
   - **Labels** — `key=value` pairs for selection (e.g. `region=eu-west-1`, `tier=gpu`).
   - **Capabilities** — list of capability names (e.g. `docker`, `gpu`).
4. Save. The Console shows a one-time service token. Copy it now — it is not retrievable later.
5. Apply the token as a Kubernetes Secret in the runner's namespace so the runner can enroll at startup.


The runner's **Status** transitions from `pending` → `enrolled` once the runner connects.

### With Terraform

```hcl
resource "agyn_runner" "shared_gpu_pool" {
  name = "gpu-pool-eu-west-1"

  labels = {
    region = "eu-west-1"
    tier   = "gpu"
  }

  capabilities = ["docker", "gpu"]
}
```

Omitting `organization_id` registers the runner as cluster-scoped. The `service_token` output is a sensitive Terraform value — feed it to your runner deployment via your Secrets manager.

## Oversee all organizations

The Organizations page lets you see every org on the platform — useful for capacity planning, lifecycle audit, or emergency cleanup.

### In the Console

1. Console → **Cluster Administration → Organizations** (`/organizations`).
2. The list shows name, member count, agent count, creation date.
3. Click an org for its detail page: rename, change ownership, or delete.


Cluster admins inherit owner-level access to every organization. You can switch the context switcher to any org and operate as an owner.

### With Terraform

```hcl
resource "agyn_organization" "acme" {
  name = "Acme Co"
}
```

Cluster admins can create organizations programmatically. Non-admins create organizations through the Console's **Create Organization** option in the context switcher.

## Cluster-scoped apps

Apps published as cluster-wide become available to every organization. Most apps are installed per-organization (see [Apps](./apps.md)), but a few platform apps (Reminders) ship at cluster level.

### In the Console

1. Console → **Cluster Administration → Apps** (`/apps`).
2. See platform-provided apps and their installation counts.
3. Promote a per-org app to cluster scope, or restrict it back.

## Related

- [Self-host install → First admin](../self-host-install/first-admin.md)
- [Runners](./runners.md) — per-org runner registration.
- [Apps](./apps.md) — per-org app management.
- [Operate → Identity](../operate/identity.md)
- [Operate → Authorization](../operate/authorization.md)
