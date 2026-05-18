---
title: Reminders
description: Scheduled follow-ups created by agents.
order: 5
---

# Reminders

A reminder is a scheduled follow-up an agent creates in a conversation. At the scheduled time, the [Reminders app](../administer/reminders-app.md) posts a message in the conversation reminding you of whatever was set up.

Reminders are useful when:

- You ask an agent to "remind me about this in an hour".
- An agent wants to check back asynchronously ("I'll let you know when the build finishes").
- A long-running task needs a follow-up after a known duration.

## See your reminders

Reminders attached to a conversation appear in the conversation detail:

1. Open the conversation.
2. Look for the **Reminders** section in the right side of the detail pane (or under the conversation header on narrow screens).
3. Each entry shows the reminder text, the scheduled time, and a **Cancel** action.

![Reminders panel in conversation detail](../_assets/console/chat/reminders.png)

Reminders for other conversations are not shown here — open the relevant conversation to see them.

## Cancel a reminder

1. Click **Cancel** on the reminder you want to drop.
2. The reminder disappears and no message will post at the scheduled time.

Cancellation is immediate and not reversible — but the agent can always create a new reminder if you change your mind.

## What happens when a reminder fires

When the time arrives, the Reminders app posts a message in the conversation as itself. The message looks like a normal message in the thread; the agent sees it just like any other message and can react.

The reminder is then complete — it does not repeat unless the agent scheduled multiple.

## Agent capabilities

Agents create reminders through a platform tool exposed when the Reminders app is installed for the organization. If your organization does not have the Reminders app, agents have no way to schedule follow-ups. Ask your admin — see [Administer → Reminders app](../administer/reminders-app.md).

## Related

- [Chat](./chat.md)
- [Administer → Reminders app](../administer/reminders-app.md) — install Reminders for your org.
