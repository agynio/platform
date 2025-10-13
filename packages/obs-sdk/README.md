# @hautech/obs-sdk

Stage 1 observability SDK for Node 18+. See docs in repo root for full scope.

Quick start:

```ts
import { init, withSpan, withAgent, withLLM, withToolCall, withSummarize, withSystem, SummarizeResponse } from '@hautech/obs-sdk';

init({
  mode: 'extended',
  endpoints: { extended: 'http://localhost:4319' },
  defaultAttributes: { service: 'demo' },
  // Heartbeat every 60s by default; override here or via OBS_HEARTBEAT_MS
  heartbeatMs: 60_000,
});

await withSpan({ label: 'demo' }, async () => {
  // generic span
});

// Agent span (can include a threadId attribute to associate all nested work)
await withAgent({ threadId: 'thread-123' }, async () => {
    const llmResult = await withLLM(
      { newMessages: [{ role: 'user', content: 'Hi' }], context: { contextKey: 'value' } },
      async () => {
        return { text: 'Hello!', toolCalls: [] };
      },
    );
    await withToolCall({ name: 'weather', input: { location: 'NYC' } }, async () => ({ tempC: 22 }));
    await withSummarize({ oldContext: 'previous long context' }, async () => ({
      summary: 'short',
      newContext: 'short+more',
    }));
      await withSummarize({ oldContext: [ { role: 'system', content: 'Long thread start...' } ] as any }, async () =>
        new SummarizeResponse({
          raw: { text: 'provider raw summary response' },
          summary: 'short',
          newContext: [ { role: 'system', content: 'short+more' } ] as any,
        }),
      );
});

// System level operation
await withSystem({ label: 'startup' }, async () => {
  /* init sequence */
});
```

## Helper Functions

All helpers wrap `withSpan` and set a `kind` plus required attributes only.

| Helper        | Signature                           | Kind      | Attributes (start)              | End attributes (if any)                        |
| ------------- | ----------------------------------- | --------- | ------------------------------- | ---------------------------------------------- |
| withAgent     | ({ threadId?, ... }, fn)            | agent     | threadId (if provided) + extras | -                                              |
| withLLM       | ({ newMessages, context, ... }, fn) | llm       | newMessages, context (+ extras) | End: `output` object with `text` / `toolCalls` |
| withToolCall  | ({ name, input, ... }, fn)          | tool_call | name, input (+ extras)          | `output`, `status`                             |
| withSummarize | ({ oldContext: ChatMessageInput[] }, fn returning SummarizeResponse) | summarize | oldContext (normalized messages) (+ extras) | `summary`, `newContext` if present             |
| withSystem    | ({ label, ... }, fn)                | system    | extras                          | -                                              |

Notes:

1. Helpers intentionally keep parameter surface minimal (spec-driven).
2. Additional attributes can still be added via raw `withSpan` if needed.
3. In error paths, `withToolCall` marks status=error; other helpers rely on span status.
4. `withLLM` and `withSummarize` require returning wrapper classes (`LLMResponse`, `SummarizeResponse`) so instrumentation can deterministically extract attributes.

## Raw API

`withSpan({ label, threadId?, nodeId?, kind?, attributes? }, fn, internal)` is the primitive. Prefer helpers for standardized semantics.

## Logging (Stage 1)

The SDK provides a contextual logger bound to the active span via `AsyncLocalStorage`.

Usage:

```ts
import { logger, withToolCall } from '@hautech/obs-sdk';

await withToolCall({ name: 'work', input: {} }, async () => {
  const log = logger();
  log.info('Starting work');
  log.debug('Halfway', { progress: 0.5 });
  log.error('Non-fatal issue', { code: 'E_WARN' });
  return { ok: true };
});
```

Configuration: Works in `extended` mode. Ensure `init({ mode: 'extended', endpoints: { extended: 'http://localhost:4319' } })` is called. Logs POST to `/v1/logs` and are streamed as realtime `log` events on the socket.

## Heartbeats

- The SDK emits a per-span heartbeat while a span is running by POSTing `{ state: 'updated' }` to `/v1/spans/upsert`.
- Interval defaults to 60s and can be configured via:
  - Env: `OBS_HEARTBEAT_MS`
  - `init({ heartbeatMs })`
- Heartbeats stop automatically when the span completes or errors.
 - Set `OBS_HEARTBEAT_MS=0` or `init({ heartbeatMs: 0 })` to disable heartbeats.
