# SendMessage tool

- Name: `send_message`
- Purpose: Send a plain-text message back to the thread's origin channel through the configured channel node.

Schema

```
{
  message: string;
}
```

Behavior

- Requires `ctx.threadId`. Uses `ThreadTransportService.sendTextToThread` to look up the persisted `channelNodeId` for the current thread and delegate delivery to the resolved node.
- When a thread has no `channelNodeId` (e.g., created in the web UI without an ingress trigger), the transport falls back to persisting the assistant reply and returns success without invoking any external adapter.
- The channel node must implement `sendToChannel(threadId, text)`; Manage, SlackTrigger, and any future channel adapters satisfy this interface.
- Returns `message sent successfully` when the transport succeeds or when the persistence-only fallback is used; otherwise returns the error string produced by the transport service (e.g. `channel_node_unavailable`, `unsupported_channel_node`, or adapter-specific failures).
- Validation: rejects missing thread context or empty `message` payload at the schema layer (min length 1).
- Run events: tool executions triggered via `send_message` emit only the standard `tool_execution` events; no additional `invocation_message` event is appended.

Notes

- Manage registers itself as the channel node for child threads when mediating worker communication. SlackTrigger (and other ingress adapters) set the channel node for user-originated threads.
- Errors are surfaced to the caller without additional formatting to simplify tool reasoning and retry behavior.
