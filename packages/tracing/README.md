# @agyn/tracing

Small tracing SDK used by the repository for instrumenting spans and logs with the extended tracing server.

Install (from workspace):

```ts
import { init, withSpan, withAgent, withLLM, withToolCall, withSummarize, withSystem, SummarizeResponse } from '@agyn/tracing';
```

Example:

```ts
import { init, withAgent, withLLM, withToolCall, LLMResponse, ToolCallResponse } from '@agyn/tracing';

init({ mode: 'extended', endpoints: { extended: 'http://localhost:48080' } });

await withAgent({ threadId: 't1', agentName: 'demo' }, async () => {
  await withLLM({ context: [{ role: 'human', content: 'Hello' }] as any }, async () =>
    new LLMResponse({ raw: { text: 'Hi' }, content: 'Hi' }),
  );
  await withToolCall(
    { toolCallId: 'tc1', name: 'weather', input: { city: 'NYC' } },
    async () => new ToolCallResponse({ raw: { tempC: 21 }, output: { tempC: 21 }, status: 'success' }),
  );
});
```
