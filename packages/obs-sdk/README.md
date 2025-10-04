# @hautech/obs-sdk

Stage 1 observability SDK for Node 18+. See docs in repo root for full scope.

Quick start:

```ts
import {
  init,
  withSpan,
  withThread,
  withAgent,
  withLLM,
  withToolCall,
  withSummarize,
  withSystem,
} from '@hautech/obs-sdk';

init({
  mode: 'extended',
  endpoints: { extended: 'http://localhost:4319' },
  defaultAttributes: { service: 'demo' },
});

await withSpan({ label: 'demo' }, async () => {
  // generic span
});

// Thread span (records kind=thread, threadId attribute)
await withThread({ threadId: 'thread-123' }, async () => {
  await withAgent({}, async () => {
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
  });
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
| withThread    | ({ threadId, ... }, fn)             | thread    | threadId + extras               | -                                              |
| withAgent     | (attributes, fn)                    | agent     | attributes                      | -                                              |
| withLLM       | ({ newMessages, context, ... }, fn) | llm       | newMessages, context (+ extras) | End: `output` object with `text` / `toolCalls` |
| withToolCall  | ({ name, input, ... }, fn)          | tool_call | name, input (+ extras)          | `output`, `status`                             |
| withSummarize | ({ oldContext, ... }, fn)           | summarize | oldContext (+ extras)           | `summary`, `newContext` if present             |
| withSystem    | ({ label, ... }, fn)                | system    | extras                          | -                                              |

Notes:

1. Helpers intentionally keep parameter surface minimal (spec-driven).
2. Additional attributes can still be added via raw `withSpan` if needed.
3. In error paths, `withToolCall` marks status=error; other helpers rely on span status.

## Raw API

`withSpan({ label, threadId?, nodeId?, kind?, attributes? }, fn, internal)` is the primitive. Prefer helpers for standardized semantics.
