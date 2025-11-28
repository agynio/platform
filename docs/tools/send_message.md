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
- Returns plain text responses: `message sent successfully` on success, otherwise an error code/message string.
- Logs adapter type and identifiers; does not log full text.

Slack-only descriptor and token resolution

- `SlackTrigger` writes the descriptor on ingress only when `identifiers.channel` is present: `{ type: 'slack', version: number, identifiers: { channel, thread_ts? } }`.
- No tokens are persisted. `SlackTrigger` requires a `bot_token` in node config and resolves it during setup/provision only.
- `SendMessage` uses the `SlackTrigger`'s resolved `bot_token` to call `SlackAdapter`.

Migration

- Add `Thread.channel` (Json?).
- `SlackTrigger` populates the descriptor on ingress for new threads when channel is present; skips otherwise.
