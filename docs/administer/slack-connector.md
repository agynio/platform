---
title: Slack Connector
description: Bridge Slack threads to Agyn conversations.
order: 22
---

# Slack Connector

The Slack Connector is an app that bridges Slack threads to Agyn conversations. Someone `@`-mentions the bot in a Slack thread — typically under a monitoring alert — and the connector forwards that mention, plus the thread history the agent has not seen, into an Agyn thread where the configured agent picks it up. The agent's reply posts back into the same Slack thread.

One Slack thread maps to one Agyn thread maps to one agent instance.

The connector is **mention-driven, not mirrored**. It subscribes to `app_mention` only; Slack messages that do not mention the bot never reach the platform. Mirroring a channel would start an agent workload for every human message in it, so it is not offered.

Setting it up is two steps: create the Slack app in your workspace, then install the connector in your Agyn organization with that app's tokens.

## What you need

- A Slack workspace where you can create and install apps.
- An organization on Agyn with at least one agent the connector should route to.
- The Slack Connector app deployed to the cluster. It ships with the platform chart and is enabled by default.

## Step 1 — Create the Slack app

The connector talks to Slack over **Socket Mode**, so it needs no public URL and no inbound firewall rule.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From a manifest**.
2. Pick the workspace, choose YAML, and paste:

   ```yaml
   display_information:
     name: Agyn
   features:
     bot_user:
       display_name: Agyn
       always_online: false
   oauth_config:
     scopes:
       bot:
         - app_mentions:read
         - channels:history
         - groups:history
         - im:history
         - mpim:history
         - channels:read
         - groups:read
         - channels:join
         - chat:write
         - users:read
         - files:read
         - files:write
         - reactions:write
   settings:
     event_subscriptions:
       bot_events:
         - app_mention
     interactivity:
       is_enabled: false
     socket_mode_enabled: true
     org_deploy_enabled: false
     token_rotation_enabled: false
   ```

   Adjust `display_information.name` and the bot's display name to taste — the rest is what the connector uses.

3. **Basic Information → App-Level Tokens → Generate Token and Scopes.** Add the `connections:write` scope and generate. Copy the `xapp-…` token — this is the `app_token`, and it is the only thing the manifest cannot declare.
4. **Install App → Install to Workspace**, then copy the **Bot User OAuth Token** (`xoxb-…`) from **OAuth & Permissions**. This is the `bot_token`.
5. Invite the bot to the channels it should work in: `/invite @Agyn`. The connector joins **public** channels by itself when it is mentioned in one it cannot read; private channels, group DMs, and DMs must be invited by a human.

Do not add `message.channels` or any other `message.*` event subscription. Every forwarded message wakes an agent instance, so a mirrored channel means an agent run per human message.

### Scopes, and what each is for

| Scope | Why |
|---|---|
| `app_mentions:read` | Receive the mentions that trigger everything |
| `channels:history`, `groups:history`, `im:history`, `mpim:history` | Read the thread the mention happened in |
| `channels:read`, `groups:read` | Resolve channel names in rendered messages |
| `channels:join` | Self-join a public channel the bot was mentioned in but is not a member of |
| `chat:write` | Post the agent's replies |
| `users:read` | Resolve `<@U…>` mentions to names |
| `files:read`, `files:write` | Carry attachments in both directions |
| `reactions:write` | Mark a mention as seen, done, or failed |

## Step 2 — Install the connector in your organization

### In the Console

1. Console → **Apps** → **Install app**.
2. Select **Slack Connector**. The installation slug is prefilled from the app slug (`slack`).
3. Paste the configuration:

   ```json
   {
     "bot_token": "xoxb-...",
     "app_token": "xapp-...",
     "agent_id": "550e8400-e29b-41d4-a716-446655440000",
     "allowed_channels": ["C0123456789"]
   }
   ```

4. Save.

Installing grants the app `thread:create` and `participant:add` in your organization — it creates a thread per Slack thread and puts the configured agent on it. Those come from the app's own declaration; there is nothing to choose.

### With Terraform

```hcl
resource "agyn_app_installation" "slack" {
  app_id          = var.slack_connector_app_id
  organization_id = agyn_organization.acme.id
  slug            = "slack"

  configuration = jsonencode({
    bot_token        = var.slack_bot_token
    app_token        = var.slack_app_token
    agent_id         = agyn_agent.oncall.id
    allowed_channels = ["C0123456789"]
  })
}
```

The connector is a platform-bundled app, so its id is not managed by your Terraform. Read it once with `agyn apps list` and pass it in as a variable.

### Configuration reference

| Key | Required | Description |
|---|---|---|
| `bot_token` | yes | Slack bot token (`xoxb-…`) from step 1 |
| `app_token` | yes | App-level token (`xapp-…`) with `connections:write`, from step 1 |
| `agent_id` | yes | UUID of the agent added as participant on every new thread |
| `allowed_channels` | no | Slack channel IDs the connector responds in. Omitted or empty means every channel the bot is mentioned in |

Configuration changes are picked up within a minute and restart that installation's Slack connection. Existing thread mappings survive.

## How it works

For each mention, the connector:

1. Adds an :eyes: reaction to the mention, so the person who wrote it knows it landed.
2. Creates an Agyn thread for the Slack thread (or reuses the existing mapping) and adds the configured agent as a participant.
3. Forwards **one** platform message: the rendered Slack thread root, then the replies newer than the last forward, then the mention itself — so the instruction is unambiguous and last in context.
4. Posts the agent's reply back into the same Slack thread, swapping the :eyes: reaction for :white_check_mark: — or :x: if the run failed.

Alert payloads are rendered from Block Kit blocks and, for Grafana, Alertmanager, PagerDuty, and Datadog, from legacy attachments — not from the `text` fallback, which is usually just `[FIRING:1] HighErrorRate`.

The thread root is re-sent on every mention because the agent cannot fetch it back once its own context has compacted. Forwards are bounded, and every bound that drops a reply says so in the forwarded message.

## Verify

1. In Slack, post a message in a channel the bot is in, then reply in its thread mentioning the bot: `@Agyn what do you make of this?`
2. The mention gets an :eyes: reaction within a second or two.
3. Console → Activity → Threads: a new thread appears with the Slack Connector and the configured agent as participants.
4. The agent's reply lands in the Slack thread, and the reaction changes to :white_check_mark:.

## Troubleshooting

**No reaction, no reply at all.** Check the installation status (Apps → installation). `Misconfigured` means the tokens or `agent_id` were rejected — an invalid `app_token` shows up here, since Socket Mode fails to connect. `Degraded` means Slack or the platform is erroring; the last error is on the same page. Also confirm the mention is in a channel listed in `allowed_channels`, if you set one.

**The bot replies "I can see your message but not this thread's history".** It is not a member of the channel and could not self-join — private channels, group DMs, and DMs need `/invite @Agyn`. The agent is told its view is partial rather than being handed a silently truncated thread.

**The bot answers in the channel but ignores messages that do not mention it.** Working as designed — see the note at the top of this page.

For anything else, the installation's audit log (Apps → installation → Audit log) records what the connector did per event.

## Rotate tokens

Regenerate the `xoxb-…` on **OAuth & Permissions** or the `xapp-…` on **Basic Information**, then update the installation configuration in the Console or in `configuration` with Terraform. The connector reconnects with the new tokens within a minute. Existing threads continue uninterrupted.

## Uninstall

Uninstalling:

- Stops the Socket Mode connection. The bot stops responding in Slack.
- Removes the connector from existing conversations. Past messages remain.
- Does not delete the Slack app — remove it from the workspace in Slack if you want that too.

### In the Console

1. Apps → **Installed** → Slack Connector → **Uninstall**.

### With Terraform

Delete the `agyn_app_installation.slack` resource and apply.

## Related

- [Apps](./apps.md)
- [Telegram Connector](./telegram-connector.md) — the same pattern for Telegram.
- [Build & extend → Apps](../build-extend/apps.md) — build connectors for other products.
