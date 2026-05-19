---
title: Chat
description: Start and manage conversations with agents.
order: 1
---

# Chat

Chat is where you talk to agents and to other users. Every conversation lives in the same list regardless of who is in it — you can have one-on-ones with an agent, group threads with a teammate plus an agent, or pure user-to-user chats.

## Sign in and pick an organization

Chat is scoped to an organization. The first time you sign in:

1. Click **Sign in** and authenticate with your OIDC provider.
2. The Chat app opens. If you belong to multiple organizations, pick one with the **organization switcher** at the top.

If you have no organizations yet, Chat shows an onboarding screen with two options:

- **Get an invite** from a member of an existing organization.
- **Create a new organization** — opens the Console.

You cannot use Chat until you belong to at least one organization.

## Layout

Chat is a list-detail UI:

- **Left panel** — conversation list.
- **Right panel** — the selected conversation.

Above the conversation list: the Agyn logo and your user button.


## Start a conversation

1. Click **+** at the top of the conversation list.
2. The composer opens. Search for participants — users and agents in your organization.
3. Pick one or more participants.
4. Type your message.
5. Send.

The conversation is created and selected. A short summary is auto-generated from the first message; you can edit it later.


## Conversation list

Every conversation in the current organization, filterable by status:

- **Open** (default) — active conversations.
- **Resolved** — conversations you've explicitly marked done.
- **All** — everything.

Each entry shows:

- Summary (the editable label).
- Participants.
- Created time.
- Activity status (for conversations with agent participants).
- Unread count (hidden when zero).

Conversations are sorted by creation time, newest first. Scroll to load older.

## Conversation detail

The right panel shows the selected conversation:

- **Header** — summary (editable), status dropdown (Open / Resolved), participants, action menu.
- **Message stream** — newest at the bottom.
- **Composer** — markdown editor with file attachments.

Messages are marked read automatically when you open a conversation. Unread badges in the list clear immediately and stay clear until you navigate away.

### Status: Open vs. Resolved

**Conversation status** is a label you control. Toggle it via the header dropdown. The UI updates immediately and rolls back if the change fails server-side.

Use Resolved to keep your Open list short. Resolved conversations stay searchable and re-openable.

### Activity status: Running, Pending, Finished

A separate **activity status** appears on conversations with agent participants, reflecting what the agent is doing:

| State | Meaning |
|---|---|
| **Running** | The agent is currently processing — making LLM calls, running tools, posting messages. |
| **Pending** | The agent has unread messages and the workload is starting, retrying, or just hasn't started yet. |
| **Finished** | No unread messages, no active workload. The most recent run is complete. |

For conversations without an agent (user-to-user only), no activity status is shown.

If a conversation is **degraded** — an unrecoverable state — the activity status is replaced by a degraded banner. You can read past messages but cannot post new ones.

## Send a message

- **Type** in the composer. Markdown is supported (bold, italics, lists, fenced code blocks, links).
- **Attach files** with the paperclip — see [Files](./files.md). Max 20 MB per attachment.
- **Send** with Enter (Shift+Enter for a newline).

Messages appear in the stream immediately. If sending fails, the message is flagged with a retry option.

## Delete a message

Hover a message → kebab menu → **Delete**. Confirmation required. Deletion is per-message and not reversible.

## Edit the summary

The summary is the label shown in the conversation list and the detail header. Auto-generated on creation; editable at any time.

1. Click the summary in the conversation header.
2. Edit and save.

## Switch organizations

Use the organization switcher at the top of the conversation list. The list, the selected conversation, and any open detail panes reload under the new organization.

## Read receipts and unread counts

The unread count on a conversation reflects messages you have not yet seen. Counts update in real time. Opening a conversation marks every message read up to the current time.

## Agent availability

Some agents are restricted to specific users — `private` agents. Those still appear in lists, but you cannot start conversations with them unless an admin has granted you an [agent role](../administer/agent-roles.md).

## Related

- [Files](./files.md) — share files with agents.
- [Inline media](./inline-media.md) — images, video, audio.
- [Charts and diagrams](./charts-diagrams.md) — what agents can render inline.
- [Reminders](./reminders.md) — what agents can schedule.
- [Run Timeline](./run-timeline.md) — see what the agent did under the hood.
