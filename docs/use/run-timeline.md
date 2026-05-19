---
title: Run Timeline
description: Inspect a single agent run — every event, LLM call, and tool output.
order: 6
---

# Run Timeline

The Run Timeline is the observability surface for a single agent execution cycle. Every message received, every LLM call, every tool execution, every context summarization shows up as an event you can drill into.

## When to open it

- You want to know exactly what an agent did between messages.
- A response looked wrong and you want to see the LLM call and the tools that fed into it.
- A tool failed and you need its stdout/stderr.
- You want to verify that an agent saw a particular file or skill in its context.
- You want to terminate a misbehaving long-running execution.

## Open the Run Timeline

Two entry points:

### From a conversation

1. Open the conversation in Chat.
2. Click **View trace** on any agent message.
3. The Run Timeline opens, scrolled to the events that produced that message.


### From the Tracing app

1. Open the Tracing app (link in the user menu, or `<your-domain>/tracing`).
2. Pick your organization and the run you care about.
3. The Run Timeline opens.

See [Tracing app](./tracing-app.md) for navigation.

## Layout

The Run Timeline is a three-region layout:

- **Top bar** — run status, duration, timestamp, token usage popover, **Terminate** button (while the run is active).
- **Left sidebar** — paginated event list.
- **Main area** — the selected event's detail.


## Event types

| Icon | Event | What it represents |
|---|---|---|
| Blue | **Message** | A message received or sent. |
| Purple | **LLM Call** | A single LLM call — request, response, token usage, full context. |
| Cyan | **Tool Execution** | A single tool call through an MCP server. |
| Gray | **Summarization** | Context compression to stay under token limits. |

Each event row shows the icon, label (e.g. `LLM Call`, the tool name, `Message • Source`), status (running / finished / failed / terminated), timestamp, and duration.

## Filter and follow

- **Filter** events by type and status using the controls above the event list.
- **Follow mode** auto-selects new events as they arrive. Toggle with the button or the **F** key.
- **Keyboard navigation**: Arrow Up / Arrow Down to step through events.

## Inspect an event

Click any event to see its detail in the main area.

### Message

Role, kind, the text content (rendered as markdown), and the raw JSON (collapsible).

### LLM Call

The fullest view — what the agent told the LLM and what the LLM said back:

- **Model** and parameters (temperature, top_p).
- **Stop reason** (`end_turn`, `max_tokens`, `tool_use`, etc.).
- **Token usage** breakdown — input, cached, output, reasoning.
- **Response** — rendered as markdown.
- **Tool calls** the LLM requested — each links to the matching Tool Execution event.
- **Context** — the full prompt the model saw, paginated: system prompts, messages, tool results, memory, summaries. New context items since the previous LLM event are highlighted.
- **Raw response** — the provider's JSON, collapsible.


### Tool Execution

- Tool name, call ID, status.
- **Input** — the structured arguments the agent passed.
- **Output** — the tool's return value.
- **Terminal output** — stdout/stderr streamed in real time while the tool runs. Shows exit code, bytes, chunks, and where the full log was saved.
- **Error details** if the tool failed.
- Raw data, collapsible.


### Summarization

- The summary text the agent wrote.
- Metrics: how many context items were collapsed, how many tokens they totaled.
- Raw data, collapsible.

## Token usage

Click the **Tokens** counter in the top bar to see the run's totals: input, cached, output, reasoning. Useful for understanding why a run is expensive.

## Terminate a run

If the agent is stuck or doing the wrong thing:

1. While the run is in progress, click **Terminate** in the top bar.
2. The orchestrator stops the workload. The run transitions to `terminated`.
3. The conversation is unaffected — you can send another message and the agent will start a new run.

## Context — what the model actually saw

The LLM Call event's **Context** view is the most powerful debugging tool. It lists every item the model saw, in order:

- System prompts.
- Skills.
- Memory snapshots.
- Past messages.
- Tool results.
- Summaries.

If the agent did the wrong thing, the answer is usually here — a wrong skill loaded, a stale tool result, a context item missing. Pagination keeps the view fast even for very long contexts.

## Real-time updates

The Run Timeline streams events as they happen. While a run is active:

- New events appear in the list.
- Event statuses transition (pending → running → finished).
- Tool terminal output streams character by character.
- Token counts update.

If you have follow mode on, the timeline auto-scrolls.

## Related

- [Tracing app](./tracing-app.md) — find a specific run.
- [Chat](./chat.md) — open a run from a message.
- [Administer → Monitoring](../administer/monitoring.md) — operator view of all workloads.
