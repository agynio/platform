---
title: Organizations
description: Create and manage organizations.
order: 3
---

# Organizations

An organization is the multi-tenant boundary on the platform. It groups users, agents, models, secrets, runners, and apps. Access control is scoped to organizations — a user is a member of one or more organizations and has a role in each.

## Create an organization

Any authenticated user can create an organization. The creator automatically becomes the owner.

### In the Console

1. Open the **context switcher** (top-right).
2. Choose **Create Organization**.
3. Enter a **Name**.
4. Save. The Console switches to the new organization's context.


### With Terraform

```hcl
resource "agyn_organization" "acme" {
  name = "Acme Co"
}
```

On apply, the calling identity (the user behind the Terraform token) is granted `owner` on the new organization.

## Settings

### In the Console

1. Console → **Organization → Overview** (`/organizations/<org>`).
2. Edit the organization name. Click **Save**.


The overview also shows summary counts (agents, members, runners, apps) at a glance.

### With Terraform

```hcl
resource "agyn_organization" "acme" {
  name = "Acme Corporation"
}
```

Updating `name` triggers a single `UpdateOrganization` call. Changing other fields where supported (description, branding) works the same way.

## Switch organizations

Open the context switcher in the top bar and pick another organization. The sidebar, lists, and detail panes reload under the new context.

If you have access to a single organization, the switcher only shows that organization and **Create Organization**.

## Delete an organization

Deleting an organization is destructive. It removes:

- All agents and their sub-resources (MCPs, hooks, skills, ENVs, volumes).
- All LLM providers, models, secrets, secret providers, image pull secrets.
- All org-scoped runners.
- All installed apps.
- All threads, messages, and traces.

### In the Console

1. Console → **Organization → Overview**.
2. Scroll to **Danger zone** at the bottom.
3. Click **Delete organization**. Type the org name to confirm.

The deletion runs in the background. The org disappears from the context switcher immediately.

### With Terraform

```hcl
# Remove the resource block, then:
# terraform apply
```

Terraform issues `DeleteOrganization`. Sub-resources managed in the same Terraform configuration are deleted in dependency order before the org itself.

## Cluster admin overrides

Cluster admins can create, rename, and delete organizations on behalf of others through **Cluster Administration → Organizations**. See [Cluster administration](./cluster-administration.md).

## What about new members?

Adding members happens after the organization exists. See [Members](./members.md).

## Related

- [Members](./members.md)
- [Cluster administration](./cluster-administration.md)
- [Operate → Authorization](../operate/authorization.md) — the ReBAC model behind org membership and roles.
