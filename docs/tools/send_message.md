SendMessage tool

- Name: send_message
- Purpose: Persist and deliver a free-form assistant message to the active thread using the ThreadOutboxService + ChannelRouter stack.

Schema

```
{
  message: string;
}
```

Execution flow

1. Requires `ctx.threadId`; the tool calls `ThreadOutboxService.send` with source `send_message` and the trimmed text.
2. ThreadOutboxService persists the message through `AgentsPersistenceService.recordOutboxMessage`, stamping `role='assistant'` and optional `runId` metadata.
3. After persistence the service delegates delivery to `ChannelRouter`. The router validates the stored `Thread.channel` descriptor and selects the matching adapter. There are no automatic retries or deduplication; adapter failures bubble back to the caller.

Channel routing

- Slack descriptor → SlackAdapter: resolves the recorded `channelNodeId`, ensures the node is an active `SlackTrigger`, then calls `SlackTrigger.sendToChannel(threadId, text)`. Optional prefixes supplied to the outbox are concatenated before dispatch.
- Manage descriptor → ManageAdapter: writes a forwarded message on the parent thread (prefix defaults to `From <AgentTitle>:` when not provided), then recursively re-enters ChannelRouter on the parent thread so the external adapter (typically Slack) delivers the text.
- Missing or invalid descriptors cause ChannelRouter to return `{ ok: false, error: 'missing_channel_adapter' | 'invalid_descriptor' | ... }`; SendMessage surfaces the error without retrying.

Author roles

- Incoming trigger or injected messages are normalized to `user` inside persistence. Outbox writes (SendMessage, ManageAdapter forwards, auto agent responses) are stored as `assistant`, ensuring conversation transcripts preserve speaker roles.
- Downstream adapters never mutate roles; they only deliver the already-persisted assistant message.

Slack descriptor and token resolution

- `SlackTrigger` writes the descriptor on ingress only when `identifiers.channel` is present: `{ type: 'slack', version, identifiers: { channel, thread_ts? } }`.
- Bot tokens are not persisted. `SlackTrigger` resolves the `bot_token` on provision, stores it in-memory, and exposes `sendToChannel`.
- SendMessage never interacts with Slack APIs directly; it always routes through SlackAdapter → SlackTrigger using the stored descriptor.
