# MCP Integration Design

## Overview
We integrate a Model Context Protocol (MCP) server that runs *inside a Docker container* and expose its tools to LangChain / LangGraph agents as dynamic tools. The MCP process communicates using newline-delimited JSON-RPC 2.0 messages over stdio.

## Key Decisions
1. **Custom Transport (DockerExecTransport)**: The SDK's `StdioClientTransport` always spawns a local process. We need to connect to a process created by `docker exec`, so we implemented a minimal transport that:
   - Starts a docker exec session with `AttachStdin/Stdout/Stderr` and `Tty:false`.
   - Demultiplexes stdout/stderr (Docker multiplex) when `Tty:false`.
   - Parses newline-delimited JSON using an inline `ReadBuffer` (mirroring SDK logic) and forwards messages to the SDK `Client` instance.
2. **Line-Oriented Protocol**: We rely on MCP servers emitting one JSON-RPC message per line. No `Content-Length` framing implemented for now—keeps implementation simple and matches the current SDK `ReadBuffer` expectations.
3. **Namespace Tool Registration**: Tools from each MCP server are registered into the agent with the prefix `<namespace>:<toolName>` to prevent collisions.
4. **Minimal Local Type for JSONRPCMessage**: Due to path / export constraints under `nodenext` resolution we defined a structural `JSONRPCMessage` type locally instead of deep-importing SDK internals; this can be replaced later.
5. **Heartbeat & Resilience (Implemented)**: The client maintains liveness with periodic `ping` and enforces timeouts. On failure it triggers a controlled restart with backoff per config.

## Components
- `ContainerService.openInteractiveExec(...)` (added): Creates a long-lived interactive exec suitable for protocols.
- `DockerExecTransport`: Adapts docker exec stream -> SDK Client transport interface (start/send/close + events).
- `LocalMCPServer`: Manages container lifecycle (ensure container, create exec, connect client, list and call tools).
- `Agent.addMcpServer` (planned): Fetch tools from `LocalMCPServer` and expose as LangChain dynamic tools.

## Data Flow
1. Agent loads configuration (namespace, image/command/env).
2. `LocalMCPServer.start()` ensures container, opens exec, starts `DockerExecTransport`, creates `Client`, performs `initialize` handshake.
3. Agent calls `listTools()` -> caches tool metadata.
4. When the model calls a tool, the dynamic wrapper invokes `server.callTool()` which issues `tools/call` via JSON-RPC.
5. Responses are validated by SDK (output schema) and returned to the tool wrapper, then to the agent graph.

## Resilience & Restart Strategy
- Timeouts and heartbeats are configurable on the server config:
  - `requestTimeoutMs`: per-request timeout for MCP JSON-RPC calls.
  - `startupTimeoutMs`: time allowed for initial `initialize`/discovery before giving up.
  - `heartbeatIntervalMs`: interval for periodic `ping` to verify liveness.
  - `staleTimeoutMs`: if no heartbeat/traffic is observed within this window, consider the session stale and restart.
  - `restart.maxAttempts`: maximum restart attempts before surfacing a terminal error.
  - `restart.backoffMs`: fixed backoff between restart attempts (may evolve to exponential).
- Discovery path is single and consistent; per-call tool sessions are ephemeral execs created for each invocation.

## Limitations
- Only newline-delimited JSON is supported. If a server uses `Content-Length` framing, a framing layer must be added.
- No streaming tool output segmentation implemented (tool results assumed to fit in memory). Future enhancement: progressive `notifications/progress` handling.
- No multiple-session multiplex; one MCP session per server instance. Per-call tool sessions are isolated ephemeral execs.

## Error surfacing and formatting
- Structured errors: When an MCP tool call fails, we prefer messages from `structuredContent` in this order: `message` > string `error` > nested `error.message` > `detail`. We also surface common code fields (`code|errorCode|statusCode`) and boolean-like retriable flags (`retriable|retryable`, including string/number forms) in a compact suffix, e.g. "(code=E_TIMEOUT retriable=false)".
- Cause: The thrown `Error` uses the full `structuredContent` (when present) as its `cause` for richer diagnostics.
- Raw fallback: If neither `structuredContent` nor textual `content` is present, we include a truncated JSON string of `raw` (capped at 2000 characters) to avoid excessive logs/token bloat.
- Consistent success formatting: On successful tool calls, `structuredContent` is formatted uniformly as YAML across SimpleAgent call sites to keep downstream output stable.

## Security Considerations
- Environment variable pass-through is controlled by config; we do not inherit host env automatically (except what Docker container already has at runtime).
- All tool schemas are treated as untrusted; validation uses server-provided schemas but can be wrapped with local allow-lists if needed later.

## Future Enhancements
| Area | Idea |
|------|------|
| Streaming | Support progressive tool output / progress notifications in checkpoint stream. |
| Framing | Add `Content-Length` support for broader MCP server compatibility. |
| Auth | Extend transport to inject auth tokens / OAuth handshake if server requests it. |
| Metrics | Add latency, error counters, restart metrics surfaced to monitoring. |
| Hot Reload | Detect updated tool list and refresh dynamically at runtime. |

## Migration Notes
If the upstream SDK later exposes a generic transport interface accepting arbitrary duplex streams, we can replace `DockerExecTransport` with that and remove inline serialization logic.

---
*Last updated: 2025-10-17*
