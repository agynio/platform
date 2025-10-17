# Manage tool

Tool name: `Manage` (class: ManageTool)

Purpose: Manage connected agents from a parent agent. Supports listing connected workers, sending a message to a specific worker using isolated child threads, and checking status of active child threads for the current parent thread.

Ports
- targetPorts: { $self: { kind: 'instance' } }
- sourcePorts: { agent: { kind: 'method', create: 'addAgent' } }

Invocation schema
```
{
  command: 'list' | 'send_message' | 'check_status',
  worker?: string,   // required for send_message
  message?: string   // required for send_message
}
```

Behavior
- list: returns array<string> of connected agent names. Names use the connected agent node id when available (via BaseAgent.getAgentNodeId()); otherwise they are assigned as agent_1, agent_2, ...
- send_message: routes the provided message to the specified worker. Requires runtime configurable.thread_id. The child thread id is composed as `${parent}__${worker}`. Returns the downstream agent’s text synchronously.
- check_status: aggregates active child threads across connected agents within the current parent thread only. Returns `{ activeTasks: number, childThreadIds: string[] }`. Suffixes are returned after stripping `${parent}__` from the active thread ids.

Validation and errors
- Missing runtime thread_id throws.
- If no agents are connected: list => [], send_message => error, check_status => `{ activeTasks: 0, childThreadIds: [] }`.
- For send_message: `worker` and `message` are required; unknown worker results in error.

Notes
- Thread isolation: child threads are keyed by `${parentThreadId}__${worker}`.
- This tool mirrors the node interface of call_agent for wiring and uses zod for input validation like other tools.

Examples
```
// List connected worker agents
{ command: 'list' }

// Send a message to worker 'agent-ops'
{ command: 'send_message', worker: 'agent-ops', message: 'deploy latest build' }

// Check status within the current parent thread
{ command: 'check_status' }
```

