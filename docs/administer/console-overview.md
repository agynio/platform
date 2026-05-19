---
title: Console overview
description: Roles, layout, and navigation in the management UI.
order: 1
---

# Console overview

The Console is the platform's management UI. It is where you configure organizations, agents, models, secrets, runners, apps, and members, and where you watch active workloads and usage.

## Who has access

| Role | Scope | Sees |
|---|---|---|
| **Cluster admin** | Platform-wide | Cluster Administration context (platform users, cluster runners, all orgs) plus every organization. |
| **Organization owner** | Per-organization | Their organizations' sections (agents, models, secrets, runners, apps, members, monitoring). |
| **Organization member** | Per-organization | No Console access. Members use [Chat](../use/chat.md) only. |

A user can be an organization owner in one org and a regular member (no Console access) in another. The context switcher only lists organizations where the user has owner-level access.

## Layout

The Console uses three regions:

- **Top bar** — current page title (left), context switcher and user menu (right). Always visible.
- **Sidebar** — navigation within the current context. Changes based on the selected context.
- **Main area** — page content. No page-level headers — the page title is in the top bar.


### Top bar

The page title appears on the left. On the right:

- **Context switcher** — dropdown that lists every organization you can access, plus **Cluster Administration** for cluster admins, plus **Create Organization**. The selected context determines what the sidebar shows.
- **User menu** — your avatar, expanding into Profile, Devices, API tokens, Pending invites, and Logout.

### Sidebar

The sidebar groups sections by domain:

- **Organization** — Overview, Members.
- **Agents** — Agents, Volumes, Runners, Apps.
- **Models** — LLM Providers, Models.
- **Secrets** — Secret Providers, Secrets, Image Pull Secrets.
- **Activity** — Workloads, Storage, Threads, Usage.

In **Cluster Administration** context, the sidebar instead shows Users, Runners, Apps, and Organizations.

### Main area

The main area follows a list-detail pattern. Resource lists support server-side sort, filter, and pagination. Destructive actions (delete, uninstall) require explicit confirmation. Non-destructive mutations apply optimistically — the UI updates immediately and rolls back on failure.

## Navigation patterns

- **Switch organization**: open the context switcher, select an org. Everything reloads under the new context.
- **Open a resource detail**: click any row in a list.
- **Bulk filter and sort**: use the column headers in any list. Filters survive page reloads but reset when you change context.
- **Find a resource by ID**: paste the ID into the URL — every resource has a stable URL like `/organizations/<org>/agents/<agent>`.

## Real-time updates

The Console subscribes to platform events over WebSocket. You will see:

- New active workloads appear in Activity → Workloads without refreshing.
- Workload status transitions (starting → running → stopped) update in place.
- Runner enrollment status flips from `pending` to `enrolled` the moment the runner connects.

If you have active filters on Workloads or Storage and an update would change visible rows, the page refetches to keep the filtered view consistent.

## API and Terraform alternative

Everything in the Console is also exposed through the Gateway API and the Terraform provider. The Console is the convenient surface; the API is the durable surface. See [Build & extend → Gateway API](../build-extend/gateway-api.md) and [Terraform](./terraform.md).

## Related

- [Cluster administration](./cluster-administration.md)
- [Organizations](./organizations.md)
- [Use → Chat](../use/chat.md) — the surface for organization members.
