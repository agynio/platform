# Manage tool

Tool name: `Manage` (class: ManageTool)

Purpose: Manage connected agents from a parent agent. Supports listing connected workers, sending a message to a specific worker using isolated child threads, and checking status of active child threads for the current parent thread.

Ports
- targetPorts: { $self: { kind: 'instance' } }
- sourcePorts: { agent: { kind: 'method', create: 'addWorker', destroy: 'removeWorker' } }

Worker lifecycle
- `addWorker(agent: AgentNode)`: registers the agent using its `agent.config.title` (trimmed). Titles must be non-empty and unique per Manage node; duplicates or missing titles throw.
- `removeWorker(agent: AgentNode)`: unregisters the agent by its title.

Invocation schema
```
{
  command: 'list' | 'send_message' | 'check_status',
  worker?: string,   // required for send_message
  message?: string,  // required for send_message
  threadAlias: string // required; child thread alias
}
```

 Behavior
- list: returns `string[]` of connected worker titles (the `agent.config.title` values).
- send_message: routes the provided message to the specified worker title. Requires runtime `LLMContext.threadId` (parent thread UUID). The tool resolves the provided `threadAlias` to a persistent child thread UUID under the parent via persistence, then invokes the worker agent with that child thread. The `worker` argument must exactly match a connected agent title.
- check_status: aggregates active child threads across connected agents within the current parent thread only. Returns `{ activeTasks: number, childThreadIds: string[] }`.

Validation and errors
- Missing runtime thread_id throws.
- If no agents are connected: list => [], send_message => error, check_status => `{ activeTasks: 0, childThreadIds: [] }`.
- For send_message: `worker` and `message` are required; unknown worker results in error.

 Notes
- Thread isolation: child threads are managed via persistence: `getOrCreateSubthreadByAlias(source, threadAlias, parentThreadId)`; only child UUIDs are passed downstream.
- This tool mirrors the node interface of call_agent for wiring and uses zod for input validation like other tools.

Examples
```
// List connected worker agents
{ command: 'list', threadAlias: 'admin' }

// Send a message to worker titled 'Agent Ops'
{ command: 'send_message', worker: 'Agent Ops', message: 'deploy latest build', threadAlias: 'ops-task-1' }

// Check status within the current parent thread
{ command: 'check_status', threadAlias: 'status' }
```
