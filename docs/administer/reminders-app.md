---
title: Reminders app
description: Let agents schedule follow-ups in conversations.
order: 20
---

# Reminders app

Reminders is a platform-provided app that lets agents create scheduled follow-ups attached to a conversation. When the time arrives, the Reminders app posts a message to the conversation as a notification.

Users see reminders inline in the conversation detail and can cancel them. See [Use → Reminders](../use/reminders.md) for the user-facing view.

## When you need it

Reminders is required for:

- Agents that should follow up on a user request later (e.g. "remind me in an hour to check on the build").
- Agents that schedule periodic check-ins.
- Any conversational pattern that requires asynchronous, time-based output.

Without the Reminders app installed, agents have no way to schedule a message in the future.

## Install in your organization

The platform ships Reminders as a cluster-scoped app on most deployments. If it is already installed for your organization, you do not need to install it again — agents can use it immediately.

To check or install:

### In the Console

1. Console → **Apps → Available** tab.
2. Find **Reminders**.
3. If it is already installed, the install button is replaced with **Open installation**. Skip to [Verify](#verify).
4. If not, click **Install**. The app requires `thread:create` and `message:send` permissions on the organization. Approve and save.

![Reminders app installation](../_assets/console/apps/reminders-install.png)

### With Terraform

```hcl
resource "agyn_app_installation" "reminders" {
  organization_id = agyn_organization.acme.id
  app_slug        = "reminders"

  permissions = ["thread:create", "message:send"]
}
```

Reminders has no required configuration — the install is otherwise empty.

## Verify

1. Console → Apps → **Installed** tab → **Reminders**.
2. The status should be `active` (the app is enrolled and reachable).
3. The audit log shows recent reminder events.

To verify end-to-end, ask an agent in a conversation to set a reminder a minute or two out. After the time elapses, the Reminders app posts a message in the conversation. See [Use → Reminders](../use/reminders.md).

## How agents use it

Agents call the Reminders capability through the platform's tool registration — typically exposed automatically once the app is installed and the agent has at least one MCP server or built-in reminders integration available. The exact wire-up depends on the agent CLI you use; refer to the agent's [Skills](./skills.md) or the CLI's documentation if a particular agent does not see reminder capabilities.

## Uninstall

Uninstalling Reminders cancels all scheduled reminders in the organization. Past reminders that have already posted remain visible in conversations.

### In the Console

1. Apps → **Installed** → Reminders → **Uninstall**.

### With Terraform

Delete the `agyn_app_installation.reminders` resource and apply.

## Related

- [Apps](./apps.md)
- [Use → Reminders](../use/reminders.md) — what users see.
- [Build & extend → Apps](../build-extend/apps.md) — build similar platform apps.
