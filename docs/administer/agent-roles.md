---
title: Agent roles
description: Grant identities per-agent owner, maintainer, or participant access.
order: 6
---

# Agent roles

By default, only organization owners can configure an agent and start conversations with `private` agents. Agent roles let you grant non-owners scoped access to a specific agent — without making them an org owner.

## Roles

| Role | Configure the agent | Manage roles | Start conversations | Change availability / delete |
|---|---|---|---|---|
| `owner` | ✓ | ✓ | ✓ | ✓ |
| `maintainer` | ✓ | — | ✓ | — |
| `participant` | — | — | ✓ | — |

Each identity holds **at most one role** per agent. Assigning a new role replaces any existing one.

Organization owners hold owner-level capabilities on every agent in their organization, regardless of any per-agent role. Agent roles are for non-owners.

## Assign a role

### In the Console

1. Console → **Agents → <agent>** (`/organizations/<org>/agents/<agent>`).
2. Open the **Roles** tab.
3. Click **Add role**.
4. Search for an identity (user, app, or another agent in the same organization).
5. Pick a role and save.


The assignment takes effect immediately. The target identity sees the agent appear in chat composers and can start conversations with it.

### With Terraform

```hcl
resource "agyn_agent_role" "alice_maintainer" {
  agent_id    = agyn_agent.support.id
  identity_id = data.agyn_user.alice.identity_id
  role        = "maintainer"
}
```

Look up an identity ID via `data.agyn_user`, `data.agyn_agent`, or `data.agyn_app`. Cross-organization assignments are rejected — the target identity must be a member of the same organization as the agent.

## Change or remove a role

### In the Console

1. Roles tab → click the row.
2. Use the **Role** dropdown to change it. Click **Remove** to revoke entirely.

### With Terraform

Change the `role` attribute (in-place update), or delete the resource block and apply.

## Use availability together with roles

Roles and availability work together to control access:

- `availability = internal`, no roles → every org member can start a conversation.
- `availability = internal`, plus participant roles → org members still have access; participants additionally count as agent-role holders (useful for apps that need to act on `private`-only data).
- `availability = private`, no roles → only org owners can start conversations.
- `availability = private`, plus roles → only owners and listed role-holders can start conversations.

## Cross-identity uses

Agent roles can be granted to any identity in the organization — not just users:

- **Apps** — give a 3rd-party connector `participant` access so it can start conversations with the agent.
- **Other agents** — let an orchestration agent add a specialist agent to its threads.
- **Service accounts** — grant CI tooling `participant` access for automated testing.

## Related

- [Agents](./agents.md) — the agent record itself.
- [Members](./members.md) — org-wide membership.
- [Operate → Authorization](../operate/authorization.md) — the underlying ReBAC model.
