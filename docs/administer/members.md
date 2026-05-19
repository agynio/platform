---
title: Members
description: Invite users to an organization and assign roles.
order: 4
---

# Members

An organization member is a user who has accepted membership in the organization. Members can be promoted to owner; owners have full administrative access. Non-owner members do not have Console access — they participate in conversations through [Chat](../use/chat.md) and can be granted per-agent roles on specific agents (see [Agent roles](./agent-roles.md)).

## Invite a user

### In the Console

1. Console → **Organization → Members** (`/organizations/<org>/members`).
2. Click **Invite member**.
3. Enter the user's **username** (the platform-wide handle assigned at OIDC sign-in).
4. Choose a **role**:
   - `owner` — full administrative access.
   - `member` — can chat with agents and access ones they have per-agent roles on. No Console access.
5. Send the invite.


The invite appears in the invitee's user menu under **Pending invites**. Until they accept, their membership status is `pending`. After acceptance, it becomes `active`.

If the user has never signed in (no `username` yet), ask them to sign in once so the platform provisions their record.

### With Terraform

```hcl
resource "agyn_organization_member" "alice" {
  organization_id = agyn_organization.acme.id
  username        = "alice"
  role            = "member"
}
```

Terraform-managed memberships skip the invite/accept flow when the caller has cluster admin or org owner rights — the user is added directly. The behavior matches the Console's invite step only for invites the user has not yet accepted.

## Change a member's role

### In the Console

1. Members list → click a member row.
2. Use the **Role** dropdown in the detail pane to switch between `owner` and `member`.
3. Confirm. The change applies immediately.


### With Terraform

```hcl
resource "agyn_organization_member" "alice" {
  organization_id = agyn_organization.acme.id
  username        = "alice"
  role            = "owner"   # changed from "member"
}
```

Terraform issues `UpdateMembershipRole`.

## Remove a member

Removing a member revokes their access to the organization. It does not delete their user record — they can still sign in and use other organizations.

### In the Console

1. Members list → member row → kebab menu → **Remove**.
2. Confirm.

### With Terraform

Delete the resource block and apply, or run `terraform destroy -target=agyn_organization_member.alice`.

## Pending and active invites

Until accepted, an invite shows up in two places:

- The owner who sent it: **Members → Pending tab** — they can cancel or resend.
- The invitee: **User menu → Pending invites** — they can accept or decline.

Both sides see the invite update in real time.

## Cluster admin shortcut

Cluster admins can add members directly without the invite step. Console → **Cluster Administration → Users → user detail → add to organization**.

## Related

- [Agent roles](./agent-roles.md) — give a member access to specific agents without making them an org owner.
- [Use → API tokens](../use/api-tokens.md) — members can manage their own API tokens.
- [Use → Chat](../use/chat.md) — what members do every day.
