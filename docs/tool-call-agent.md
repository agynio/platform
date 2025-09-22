# CallAgentTool

Purpose
- Let one agent synchronously invoke another agent as a subtask.

Configuration
- description: string (required). Shown to the LLM as the tool description.

Ports
- targetPorts
  - $self: instance
- sourcePorts
  - agent: method (create: setAgent)

Invocation schema (LLM arguments)
- input: string (required). The message to forward.
- context: object (optional). Passed through to TriggerMessage.info.

Behavior
- If no target agent attached: returns exactly the string "Target agent is not connected".
- Thread ID is read from config.configurable.thread_id; if missing, defaults to "default".
- Forwards TriggerMessage { content: input, info: context || {} } to BaseAgent.invoke(threadId, [message]).
- Returns the target agent's last message text if available; otherwise a JSON string of the message; empty string if no result.
- Errors are caught and returned as text: `Error calling agent: <message>`.

Graph wiring example

Nodes
- A: { template: 'simpleAgent' }
- B: { template: 'simpleAgent' }
- T: { template: 'callAgentTool', config: { description: "Call B to evaluate something" } }

Edges
- { source: 'A', sourceHandle: 'tools', target: 'T', targetHandle: '$self' }
- { source: 'T', sourceHandle: 'agent', target: 'B', targetHandle: '$self' }

Notes
- The description field is the only valid configuration key; any other keys are ignored.
- Logging: each invocation logs info with { targetAttached: boolean, hasContext: boolean } and errors with message and stack.
