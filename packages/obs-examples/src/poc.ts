import {
  init,
  withSpan,
  withSystem,
  withThread,
  withAgent,
  withLLM,
  withToolCall,
  withSummarize,
} from '@hautech/obs-sdk';

async function main() {
  const endpoint = process.env.OBS_EXTENDED_ENDPOINT || 'http://localhost:4319';
  init({
    mode: 'extended',
    endpoints: { extended: endpoint },
    defaultAttributes: { service: 'poc-app' },
  });
  await withSystem({ label: 'startup', phase: 'init' }, async () => {
    // simulate initialization
    await new Promise((r) => setTimeout(r, 1000));
  });

  await withThread({ threadId: 'demo-thread' }, async () => {
    await withAgent({ agentName: 'demo-agent' }, async () => {
      // Simulate an LLM call
      const llmResult = await withLLM(
        { newMessages: [{ role: 'user', content: 'Hello' }], context: { topic: 'greeting' } },
        async () => {
          await new Promise((r) => setTimeout(r, 1500));
          return { text: 'Hi there!', toolCalls: [] };
        },
      );

      // Simulate tool call
      const weather = await withToolCall({ name: 'weather', input: { city: 'NYC' } }, async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return { tempC: 22 };
      });

      // Summarize context
      await withSummarize({ oldContext: JSON.stringify({ llmResult, weather }) }, async () => {
        await new Promise((r) => setTimeout(r, 800));
        return { summary: 'Exchanged greeting and fetched weather', newContext: { greeted: true, weather } };
      });
    });
  });
}

main().catch(console.error);
