# Tool Call Agent Extensions

This document covers additional semantics around tool calls, termination, and output restriction enforcement.

TerminateResponse
- New type exported at apps/server/src/tools/terminateResponse.ts: `export class TerminateResponse { constructor(public message?: string) {} }`.
- Any tool may return `new TerminateResponse(note?)` to explicitly signal the agent should end the current run.
- ToolsNode inspects tool outputs. If a tool returns a TerminateResponse:
  - It appends a ToolMessage with content = `note` if provided, else `"Finished"`.
- It returns NodeOutput with `done=true`. The Agent graph treats this as a terminal condition from the tools branch.

Finish tool
- New tool at apps/server/src/tools/finish.tool.ts providing a standard way to end a task.
  - Name: `finish`
  - Description: "Signal the current task is complete. Call this before ending when output is restricted."
  - Schema: `{ note?: string }`
  - Behavior: returns `new TerminateResponse(note)`.
- Registered in the template registry as `finishTool` with `targetPorts: { $self: { kind: 'instance' } }` and metadata `{ title: 'Finish', kind: 'tool', capabilities: { staticConfigurable: true } }`.

Agent configuration additions
- Three static config fields were added to Agent (apps/server/src/agents/agent.ts):
  - `restrictOutput: boolean = false` (default false for backward compatibility)
  - `restrictionMessage: string = "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool."`
  - `restrictionMaxInjections: number = 0` (0 means unlimited per turn)
- The base system prompt remains unchanged. We do not concatenate restrictionMessage into it.

Enforcement node
- New node apps/server/src/nodes/enforceRestriction.node.ts injects a SystemMessage with `restrictionMessage` when the model attempts to finish without tool calls.
- Behavior in `action(state)`, per turn:
  - If `restrictOutput=false` -> `{}`
  - If last AI message had tool_calls -> `{}`
  - Else if `restrictionMaxInjections===0` -> append SystemMessage(restrictionMessage), increment `restrictionInjectionCount`, set `restrictionInjected=true`.
  - Else if `restrictionInjectionCount < restrictionMaxInjections` -> inject as above.
  - Else -> return `{ restrictionInjected: false }` (no message injection).

State and NodeOutput additions
- NodeOutput now includes optional `done`, `restrictionInjectionCount`, and `restrictionInjected` fields.
- Agent state tracks the same keys with reducers `(right ?? left)` and defaults `(false/0/false)`.
- SummarizationNode resets `restrictionInjectionCount` and `restrictionInjected` to per-turn defaults each time it runs.

Graph wiring (Agent)
- Nodes: summarize, call_model, tools, enforce.
- Edges:
  - START → summarize
  - summarize → call_model
  - call_model → (tools if AI.tool_calls.length > 0 else enforce)
  - enforce → (call_model if restrictionInjected===true else END)
  - tools → (END if done===true else summarize)

Semantics and defaults
- With `restrictOutput=false`, behavior is unchanged: if the model returns without tool_calls, the run ends.
- With `restrictOutput=true`, the agent will inject the `restrictionMessage` and retry the model call up to `restrictionMaxInjections` times per turn. If `restrictionMaxInjections=0`, injections are unlimited per turn; the overall recursion is still bounded by `RunnableConfig.recursionLimit`.
- The standard way to finish when restricted is to call the `finish` tool (optionally with a `note`), which returns `TerminateResponse`.

Testing
- Vitest tests cover termination signaling, enforcement looping, summarization reset of counters, and preservation of system prompt.
