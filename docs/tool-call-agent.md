# CallAgentTool

Purpose
- Let one agent invoke another agent as a subtask.

Configuration
- description: string (required). Shown to the LLM as the tool description.
- name: string (optional) Tool name override.
- response: 'sync' | 'async' | 'ignore' (optional, default 'sync')
  - sync: default. Wait for the child agent to complete and return its text.
  - async: return {status: 'sent'} immediately; when the child completes, the parent (caller) is invoked with a TriggerMessage carrying the child output.
  - ignore: return {status: 'sent'} immediately and do not callback.

Ports
- targetPorts
  - $self: instance
- sourcePorts
  - agent: method (create: setAgent)

Invocation schema (LLM arguments)
- input: string (required). The message to forward.
- context: any (optional). Passed through to TriggerMessage.info when calling the child.
- childThreadId: string (required). Appended to the parent thread id as `${parentThreadId}__${childThreadId}` to form the child thread id.

Behavior
- If no target agent attached: returns exactly the string "Target agent is not connected".
- Parent thread id comes from runtime config: configurable.thread_id.
- Child thread id = `${parentThreadId}__${childThreadId}`.
- Forwards TriggerMessage { content: input, info: context || {} } to BaseAgent.invoke(childThreadId, [message]).
- sync: returns the child agent's last message text (empty string if undefined).
- async: returns `{status: 'sent'}` immediately; when the child completes, invokes the caller agent with:
  - thread: parentThreadId
  - message: { content: <childText>, info: { from: 'agent', childThreadId: <childThreadId> } }
- ignore: returns `{status: 'sent'}` immediately; no callback is made even if the child succeeds or fails.
- Async errors are only logged; no error callback is sent to parent.

Caller agent reference (runtime wiring)
- Async callbacks require the caller agent instance to be available at runtime as `configurable.caller_agent`.
- The BaseAgent passes `caller_agent: this` into the graph runtime, and ToolsNode forwards `configurable.caller_agent` into the tool invocation runtime config.

Graph wiring example

Nodes
- A: { template: 'simpleAgent' }
- B: { template: 'simpleAgent' }
- T: { template: 'callAgentTool', config: { description: "Call B to evaluate something", response: 'async' } }

Edges
- { source: 'A', sourceHandle: 'tools', target: 'T', targetHandle: '$self' }
- { source: 'T', sourceHandle: 'agent', target: 'B', targetHandle: '$self' }

Notes
- Logging: each invocation logs info with { targetAttached, hasContext, responseMode } and errors with message and stack.
