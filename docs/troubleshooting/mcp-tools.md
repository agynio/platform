---
title: MCP tools fail
description: Tool returns error, tool not visible to agent.
order: 6
---

# MCP tools fail

MCP tool issues fall into three buckets: the tool isn't visible to the agent at all, the tool is called but returns an error, or the tool runs but the result is wrong.

## Tool isn't visible to the agent

The agent doesn't see the tool in its list. Check:

- **MCP attached to the agent?** Console → Agents → <agent> → MCPs tab. The MCP should be listed.
- **Did the agent restart since the MCP was added?** Configuration changes take effect on the next workload start. Stop the current workload to force a refresh.
- **MCP sidecar healthy?** Open the workload detail. The MCP sidecar should be in the container list, status `running`. If it's `waiting` or `terminated`, check its logs.
- **MCP exposes tools?** Some MCPs use lazy discovery. Run the MCP locally and confirm `tools/list` returns the expected tools.

## Tool call returns an error

The agent called the tool but the tool returned an error. In the [Run Timeline](../use/run-timeline.md), the Tool Execution event shows:

- The structured input.
- The structured output (or error).
- The terminal output (stdout/stderr while running).

Common causes:

- **Wrong arguments.** The agent guessed at the tool's input schema. Tighten the schema in your MCP — required fields, JSON Schema constraints — so the agent retries with valid input.
- **Missing credentials.** The MCP needs an API key or secret that isn't set in its ENVs. Check `Administer → MCP servers → <mcp> → ENVs`.
- **Network unreachable.** The MCP's outbound network can't reach the system it's calling. Check egress policies for the agent's namespace.
- **Tool ran out of resources.** Memory limit hit. Bump the MCP's `compute` resources.

## Tool runs but returns wrong data

Less of a "platform" issue, more of an MCP correctness issue:

- The MCP's tool implementation has a bug.
- The MCP is hitting a stale cache.
- The MCP is reading from a database that's out of date.

Use the Run Timeline's Tool Execution detail (input + output) to compare what the agent sent vs. what your MCP returned. Reproduce outside the platform if possible.

## stdio MCPs

Agyn wraps stdio MCPs with an in-pod adapter sidecar. Issues specific to stdio:

- **Adapter fails to spawn the MCP process.** Logs show the spawn error — usually missing binary in the image.
- **MCP writes to stderr aggressively.** Some stdio MCPs use stderr for protocol messages; the adapter handles standard MCP framing only. If your MCP doesn't follow the protocol strictly, it might appear to hang.

Prefer Streamable HTTP for new MCPs — fewer footguns.

## Tool calls succeed but the agent ignores the result

The Run Timeline shows the tool returned successfully, but the next LLM event has the same incorrect output.

- **Result format mismatch.** Your tool returned text but the agent CLI expected an image, or vice versa. Use the right MCP content type for the data.
- **Truncation.** Very long tool outputs may be truncated by the agent CLI before being included in context. Have the tool return a summary plus a file reference, and let the agent decide whether to read more.
- **Cached context.** The agent's loop may have decided the previous output was authoritative. Look at the LLM Call event's context to confirm the tool result is in there.

## Tool calls hang

A tool call that never returns:

- **Slow upstream.** Web requests, large queries. The MCP can stream progress notifications back via MCP's `progress` mechanism — agents and the Run Timeline show these in real time.
- **MCP deadlocked.** Bug in your MCP. Check its logs and add timeouts.
- **Tool intentionally long-running.** Configure your agent's `idle_timeout` high enough that `agynd` keeps the workload alive while the tool runs. `agynd` sends keepalives as long as the agent CLI is producing output — including tool calls in progress.

## Files MCP returns 403 / not found

For `files-mcp`:

- The agent is trying to read a file from a thread it's not a participant of. Files are scoped to the parent thread; cross-thread reads are denied.
- The file ID is wrong. Confirm by listing the thread's files.

## Testing an MCP outside the platform

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to call your MCP directly:

```sh
npx @modelcontextprotocol/inspector \
  --command 'docker run -i --rm ghcr.io/acme/my-mcp:latest'
```

If the MCP works in the Inspector but fails in Agyn, the difference is likely the ENVs the platform injects — confirm those locally.

## Related

- [Administer → MCP servers](../administer/mcp-servers.md)
- [Build & extend → MCP servers](../build-extend/mcp-servers.md)
- [Use → Run Timeline](../use/run-timeline.md)
