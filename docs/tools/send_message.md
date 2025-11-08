SendMessage tool

- Name: send_message
- Purpose: Send a text message to the thread’s Slack channel using the stored descriptor.

Schema

```
{
  message: string;
}
```

Behavior

- Requires ctx.threadId; loads `Thread.channel` and validates the Slack-only descriptor.
- Uses SlackAdapter directly; no registry or multi-channel support in v1.
- Returns a JSON envelope: `{ ok, channelMessageId?, threadId?, error? }`.
- Logs adapter type and identifiers; does not log full text.

Slack-only descriptor and token

- `SlackTrigger` writes the descriptor on ingress: `{ type: 'slack', identifiers: { channelId, threadTs? }, auth: { botToken: string | { value, source: 'vault' } } }`.
- `SlackAdapter` resolves the bot token only from the descriptor (direct string or via VaultService when `source: 'vault'`).

Migration

- Add `Thread.channel` (Json?) and `Thread.channelVersion` (Int?).
- `SlackTrigger` populates the descriptor on ingress for new threads.
