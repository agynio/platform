---
title: Telegram Connector
description: Bridge Telegram chats to Agyn conversations.
order: 21
---

# Telegram Connector

The Telegram Connector is an app that translates between Telegram chats and Agyn conversations. Once installed, users on Telegram can talk to your agents directly; their messages appear in Agyn conversations, and agent responses post back to Telegram.

## What you need

- A **Telegram bot token**. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram.
- An organization on Agyn with at least one agent the connector should route to.
- The Telegram Connector app deployed to the cluster (if not pre-installed on your platform).

## Install in your organization

### In the Console

1. Console → **Apps → Available** tab.
2. Find **Telegram Connector**. Click **Install**.
3. Configure:
   - **Bot token** — from BotFather.
   - **Default agent** — which agent receives Telegram messages by default. You can override per chat in the connector's configuration.
4. Approve permissions:
   - `thread:create` — create a conversation per Telegram chat.
   - `participant:add` — add the configured agent.
   - `message:send` — post replies back.
5. Save.


The connector validates the bot token. If invalid, the install fails with the Telegram API error.

### With Terraform

```hcl
resource "agyn_app_installation" "telegram" {
  organization_id = agyn_organization.acme.id
  app_slug        = "telegram-connector"

  configuration = jsonencode({
    bot_token     = var.telegram_bot_token
    default_agent = agyn_agent.support.id
  })

  permissions = ["thread:create", "participant:add", "message:send"]
}
```

## How it works

Once installed, the connector:

1. Connects to Telegram via the bot's long-polling or webhook endpoint.
2. For each Telegram chat it sees, it either creates an Agyn conversation (first message) or routes to the existing one (subsequent messages).
3. Each Telegram user maps to an internal app-managed identity on Agyn — distinct from real platform users.
4. Agent responses in the Agyn conversation get sent back to the Telegram chat.

The Telegram chat ID is preserved on the Agyn thread, so you can identify which conversation belongs to which Telegram user.

## Update bot token

Tokens rotate when you revoke and regenerate on BotFather.

### In the Console

1. Apps → **Installed** → Telegram Connector.
2. Click **Edit configuration**.
3. Paste the new `bot_token`. Save.

The connector reconnects with the new token within seconds. Existing conversations continue uninterrupted.

### With Terraform

Update `configuration.bot_token` and apply.

## Verify

1. Open Telegram and message your bot. Try `/start` or any text message.
2. Check Agyn → Activity → Threads. A new thread appears with the Telegram Connector as a participant and the message visible.
3. The configured default agent responds; the response also lands in Telegram.

If the bot does not respond:

- Confirm the bot's privacy mode in BotFather — if enabled, the bot only sees messages addressed to it.
- Check the app's audit log for errors (Apps → installation → Audit log).
- See [Troubleshooting](../troubleshooting/README.md).

## Per-chat agent override

Some teams route different Telegram chat IDs to different agents (e.g. dev support vs. user support). Configure routing in the connector's `configuration` JSON — see the connector's repository for the schema.

## Uninstall

Uninstalling:

- Stops the Telegram bot connection. The bot becomes unresponsive on Telegram.
- Removes the connector from existing conversations. Past messages remain.
- Does not delete the bot from Telegram — only revokes the platform's access.

### In the Console

1. Apps → **Installed** → Telegram Connector → **Uninstall**.

### With Terraform

Delete the `agyn_app_installation.telegram` resource and apply.

## Related

- [Apps](./apps.md)
- [Build & extend → Apps](../build-extend/apps.md) — build connectors for other products.
