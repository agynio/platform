# Manage tool

Tool name: `Manage` (class: ManageTool)

Purpose: Manage connected agents from a parent agent. Supports sending a message to a specific worker using isolated child threads and checking status of active child threads for the current parent thread. Connected workers are addressed by their configured agent titles (trimmed).

Ports
- targetPorts: { $self: { kind: 'instance' } }
- sourcePorts: { agent: { kind: 'method', create: 'addWorker' } }

Configuration
- `mode`: `'sync'` (default) waits for the first assistant response before returning. `'async'` forwards worker responses back to the parent agent without waiting.
- `syncTimeoutMs`: Maximum time (ms) to wait for the first worker response in sync mode. Default `15000`.
- `syncMaxMessages`: Number of assistant messages to collect before returning in sync mode. Default `1`.
- `asyncPrefix`: Text prefix applied to forwarded responses. Supports `{{agentTitle}}` placeholder. Default `From {{agentTitle}}: `.
- `showCorrelationInOutput`: When enabled, prefixes forwarded responses with the worker alias and child thread id for easier correlation.

Invocation schema
```
{
  command: 'send_message' | 'check_status',
  worker?: string,   // required for send_message; matches the agent title
  message?: string,  // required for send_message
  threadAlias: string // required; child thread alias
}
```

 Behavior
- send_message: routes the provided message to the specified worker. Requires runtime LLMContext.threadId (parent thread UUID). The tool resolves the provided `threadAlias` to a persistent child thread UUID under the parent via persistence, then invokes the worker agent with that child thread. The `worker` field must match the connected agent's configured title (whitespace-insensitive).
- check_status: aggregates active child threads across connected agents within the current parent thread only. Returns `{ activeTasks: number, childThreadIds: string[] }`.

Forwarding pipeline
- Child threads created through Manage send_message store their outbound messages using the ThreadOutboxService stack. ChannelRouter detects a `manage` descriptor on the child thread and delegates delivery to ManageAdapter.
- ManageAdapter looks up the parent thread, builds a prefix (`From <AgentTitle>:` by default or the caller-supplied prefix), persists the forwarded text on the parent thread with `role='assistant'`, and returns the parent thread id to ChannelRouter.
- ChannelRouter then resolves the parent thread's descriptor (Slack, manage, …) and sends the forwarded text through the resulting adapter. There is no retry/deduplication layer; failures (e.g. parent missing a channel) are surfaced as errors such as `manage_missing_parent` or `missing_parent_channel`.

Validation and errors
- Missing runtime thread_id throws.
- If no agents are connected: send_message => error, check_status => `{ activeTasks: 0, childThreadIds: [] }`.
- For send_message: `worker` and `message` are required; unknown worker (title mismatch) results in error.

- Notes
- Thread isolation: child threads are managed via persistence: `getOrCreateSubthreadByAlias(source, threadAlias, parentThreadId, summary)`; the manage tool always supplies an empty summary string.
- Connected agents must expose a non-empty `title` in their configuration. ManageToolNode enforces uniqueness by trimmed title and resolves workers using that title at runtime.
- This tool mirrors the node interface of call_agent for wiring and uses zod for input validation like other tools.

Examples
```
// Send a message to worker 'agent-ops'
{ command: 'send_message', worker: 'agent-ops', message: 'deploy latest build', threadAlias: 'ops-task-1' }

// Check status within the current parent thread
{ command: 'check_status', threadAlias: 'status' }

// Send a message using a worker title that contains extra whitespace (trimmed automatically)
{ command: 'send_message', worker: '  agent-ops  ', message: 'sync status', threadAlias: 'ops-task-2' }
```
