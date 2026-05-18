---
title: Tracing app
description: Navigate to any run across your organizations.
order: 7
---

# Tracing app

The Tracing app is the entry point for observability. It is a three-level hierarchy:

```
User → Organization → Run
```

Pick an organization, then pick a run, then drill into the [Run Timeline](./run-timeline.md).

## Open the Tracing app

- From the Chat app's user menu → **Tracing**.
- Directly at `<your-domain>/tracing`.

## Home

The Home page lists every organization you have access to. If you only belong to one organization, the Tracing app auto-navigates into it.

![Tracing home — organizations list](../_assets/console/tracing/home.png)

## Organization page

The organization page lists every recent run, newest first, paginated.

| Column | Notes |
|---|---|
| **Agent** | The agent that ran. |
| **Thread ID** | The conversation the run is part of. |
| **Status** | Run status (`running`, `finished`, `failed`, `terminated`). |
| **Started** | When the run began. |
| **Duration** | How long the run took, or how long it's been running. |

Click a run to open the [Run Timeline](./run-timeline.md).

![Tracing organization page — recent runs](../_assets/console/tracing/organization.png)

The page subscribes to real-time updates — new runs appear at the top and status/duration update in place.

## Breadcrumb navigation

The Tracing app's breadcrumb sits in the top-left. Each segment is a dropdown:

- **User** — always present. Profile, Sign out.
- **Organization** — on the org page and the run page. Lists every org you can access; the current one is highlighted; selecting another navigates to it.
- **Run** — on the run page only. Static label (the agent name and start time).

![Tracing breadcrumb with organization dropdown](../_assets/console/tracing/breadcrumb.png)

## Finding a specific run

If you have a message ID:

1. Open the conversation.
2. Click **View trace** on the message. The Tracing app opens at the run that produced that message.

If you have a run ID:

1. Visit `/tracing/runs/<run-id>` directly.

If you only have a rough time window:

1. Open the relevant organization in the Tracing app.
2. Scroll back through runs until you find what you need.

## Related

- [Run Timeline](./run-timeline.md) — what you see after picking a run.
- [Chat](./chat.md) — the source surface that links into Tracing.
