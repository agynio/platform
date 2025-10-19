import {
  init,
  LLMResponse,
  logger,
  SummarizeResponse,
  ToolCallResponse,
  withAgent,
  withLLM,
  withSummarize,
  withSystem,
  withToolCall,
} from '@agyn/tracing';

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

  await withAgent({ threadId: 'demo-thread', agentName: 'demo-agent' }, async () => {
      // Loop 1: existing rich context -> tool
      const weatherToolCallId1 = 'tc_weather_1';
      const richContext: any[] = [
        { role: 'system', content: 'You are a helpful assistant specializing in weather and reminders.' },
        { role: 'human', content: 'Hi assistant!' },
        { role: 'ai', content: 'Hello! How can I help you today?' },
        { role: 'human', content: 'What is the weather in NYC?' },
        { role: 'system', content: 'Ensure responses are concise.' },
        { role: 'human', content: 'Also, set a reminder to check humidity.' },
        { role: 'ai', content: 'I can fetch the weather and set a reminder. One moment.' },
        { role: 'tool', toolCallId: 'memory_lookup_1', content: 'No prior weather queries stored.' },
        { role: 'human', content: 'Add Brooklyn specifically.' },
        { role: 'ai', content: 'Got it. Will include Brooklyn specifics.' },
        { role: 'human', content: 'And include temperature in Celsius.' },
        { role: 'system', content: 'Do not include sensitive data.' },
        { role: 'human', content: 'What about sunrise time?' },
        { role: 'ai', content: 'I will retrieve current conditions and sunrise time.' },
        {
          role: 'system',
          content:
            'Formatting Guidelines:\n- Provide temperature in Celsius and Fahrenheit\n- Include sunrise and sunset on separate lines\n- If UV index > 7, add a caution line\n- Keep overall response under 120 words',
        },
        {
          role: 'human',
          content:
            'Actually, could you also:\n1. Show humidity\n2. Show wind speed\n3. Provide a short recommendation about clothing\n4. Repeat the city name at the top\nThanks!',
        },
        {
          role: 'ai',
          content:
            'Plan:\n- Fetch base weather (temp, humidity, wind)\n- Fetch astronomical data (sunrise/sunset)\n- Derive clothing recommendation from temperature + wind chill\n- Check UV index for safety notice\nProceeding with tool calls...',
        },
        {
          role: 'human',
          content:
            '# Detailed Weather Report Request\n\nPlease include:\n\n## Sections\n- **Current Conditions**\n- **Astronomy** (sunrise/sunset)\n- **Advisories** (UV, wind)\n\n## Format\n1. Start with a title line.\n2. Provide a bullet list summary.\n3. Add a short code block showing JSON of raw key metrics.\n\n```json\n{ "want": ["tempC", "tempF", "humidity", "windKph" ] }\n```\n\nThanks!',
        },
        {
          role: 'ai',
          content:
            'Acknowledged. I will structure the response as requested.\n\n```pseudo\nsteps = [\n  "gather_weather()",\n  "compute_advisories()",\n  "format_markdown()"\n]\n```',
        },
        {
          role: 'tool',
          toolCallId: 'weather_source_prefetch',
          content: 'Prefetch complete: sources=[noaa, open-meteo]\nlat=40.7128 lon=-74.0060',
        },
        { role: 'tool', toolCallId: 'prior_summary_1', content: 'Previous summary: greeting only.' },
        { role: 'human', content: 'Thanks!' },
        { role: 'ai', content: 'You are welcome. Proceeding with weather lookup.' },
        { role: 'human', content: 'Can you also estimate UV index?' },
        { role: 'system', content: 'If multiple tool calls needed, batch them.' },
        { role: 'human', content: 'Let me know if you need clarification.' },
      ];

      let llmResult1Content: string | undefined;
      const llmResult1 = await withLLM({ context: richContext as any }, async () => {
        await new Promise((r) => setTimeout(r, 800));
        const raw = { text: 'Initial weather request acknowledged.' };
        const resp = new LLMResponse({
          raw,
          content: 'I will look up the weather for NYC including Brooklyn details.',
          toolCalls: [{ id: weatherToolCallId1, name: 'weather', arguments: { city: 'NYC' } }],
        });
        llmResult1Content = resp.content;
        return resp;
      });

      const weather1 = await withToolCall(
        { toolCallId: weatherToolCallId1, name: 'weather', input: { city: 'NYC' } },
        async () => {
          const log = logger();
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          log.info('Loop1: starting weather lookup');
          await sleep(300);
          log.debug('Loop1: fetching provider data');
          await sleep(300);
          log.info('Loop1: complete');
          const result = { tempC: 22, humidity: 0.55 };
          return new ToolCallResponse({ raw: result, output: result, status: 'success' });
        },
      );

      // Loop 2: follow-up analysis -> different tool (e.g., advisory)
      const advisoryToolCallId = 'tc_advisory_1';
      let llmResult2Content: string | undefined;
      const llmResult2 = await withLLM(
        {
          context: [
            { role: 'system', content: 'You are an assistant generating human-friendly advisories.' },
            { role: 'human', content: 'Provide clothing and UV advice given current conditions.' },
            { role: 'tool', toolCallId: weatherToolCallId1, content: JSON.stringify(weather1) },
          ],
        },
        async () => {
          await new Promise((r) => setTimeout(r, 600));
          const resp = new LLMResponse({
            raw: { text: 'Computing advisories.' },
            content: 'Based on current conditions I will compute advisory.',
            toolCalls: [
              {
                id: advisoryToolCallId,
                name: 'advisory',
                arguments: { tempC: weather1.tempC, humidity: weather1.humidity },
              },
            ],
          });
          llmResult2Content = resp.content;
          return resp;
        },
      );

      const advisory = await withToolCall(
        { toolCallId: advisoryToolCallId, name: 'advisory', input: { tempC: weather1.tempC } },
        async () => {
          const log = logger();
          log.info('Loop2: generating advisory');
          const result = { clothing: 'Light jacket', uvCaution: false };

          return new ToolCallResponse({ raw: result, output: result, status: 'success' });
        },
      );

      // Loop 2b: demonstrate a failing tool call (intentional error)
      // Shows how instrumentation records a span with status=error when the tool function throws
      const failingToolCallId = 'tc_fail_demo_1';
      try {
        await withLLM(
          {
            context: [
              { role: 'system', content: 'Assistant deciding whether to invoke unreliable tool.' },
              { role: 'human', content: 'Please run the unreliable step.' },
            ],
          },
          async () => {
            return new LLMResponse({
              raw: { text: 'About to invoke failing tool.' },
              content: 'Attempting failing tool call now.',
              toolCalls: [
                {
                  id: failingToolCallId,
                  name: 'unstable_tool',
                  arguments: { simulate: 'failure' },
                },
              ],
            });
          },
        );

        // Intentionally throw inside withToolCall to produce status=error
        await withToolCall(
          { toolCallId: failingToolCallId, name: 'unstable_tool', input: { simulate: 'failure' } },
          async () => {
            const log = logger();
            log.info('Loop2b: about to fail intentionally');
            await new Promise((r) => setTimeout(r, 200));
            throw new Error('Demonstration failure from unstable_tool');
          },
        );
      } catch (err) {
        const log = logger();
        log.error('Captured expected failing tool call', { error: err instanceof Error ? err.message : String(err) });
      }

      // Loop 2c: explicit error ToolCallResponse (return-based, not thrown)
      // This demonstrates providing a structured error payload via ToolCallResponse with status='error'
      const explicitErrorToolCallId = 'tc_explicit_error_1';
      await withLLM(
        {
          context: [
            { role: 'system', content: 'Assistant planning an explicit error tool call.' },
            { role: 'human', content: 'Invoke the checker tool even if it will report an error.' },
          ],
        },
        async () =>
          new LLMResponse({
            raw: { text: 'Preparing explicit error tool call' },
            content: 'Calling checker tool which will return an error structure.',
            toolCalls: [
              {
                id: explicitErrorToolCallId,
                name: 'checker',
                arguments: { mode: 'validate', payloadSize: 0 },
              },
            ],
          }),
      );

      await withToolCall(
        { toolCallId: explicitErrorToolCallId, name: 'checker', input: { mode: 'validate', payloadSize: 0 } },
        async () => {
          const log = logger();
          log.info('Loop2c: returning explicit error ToolCallResponse');
          const errorDetails = {
            code: 'EMPTY_INPUT',
            message: 'No payload provided for validation',
            hint: 'Provide non-empty payloadSize to proceed',
          };
          return new ToolCallResponse({
            raw: errorDetails,
            output: errorDetails,
            status: 'error',
          });
        },
      );

      // Loop 3: final synthesis (no tool call) -> exit
      let llmResult3Content: string | undefined;
      const llmResult3 = await withLLM(
        {
          context: [
            { role: 'system', content: 'You are a summarizer.' },
            { role: 'tool', toolCallId: weatherToolCallId1, content: JSON.stringify(weather1) },
            { role: 'tool', toolCallId: advisoryToolCallId, content: JSON.stringify(advisory) },
            // Include failing tool call reference as a tool message so it appears in summary context (optional)
            { role: 'tool', toolCallId: 'tc_fail_demo_1', content: 'Tool failed intentionally (no output).' },
            { role: 'human', content: 'Provide a concise final weather + advisory summary.' },
          ],
        },
        async () => {
          await new Promise((r) => setTimeout(r, 400));
          const resp = new LLMResponse({
            raw: { text: 'Summary ready.' },
            content: 'NYC Weather: 22°C (humid 55%). Light jacket recommended. No UV caution today.',
            toolCalls: [],
          });
          llmResult3Content = resp.content;
          return resp;
        },
      );

      // Summarize context across loops
      await withSummarize(
        {
          oldContext: [
            { role: 'system', content: 'Conversation recap preparation.' },
            { role: 'ai', content: llmResult1Content || 'No first response' },
            { role: 'tool', toolCallId: weatherToolCallId1, content: JSON.stringify(weather1) },
            { role: 'ai', content: llmResult2Content || 'No second response' },
            { role: 'tool', toolCallId: advisoryToolCallId, content: JSON.stringify(advisory) },
            { role: 'ai', content: llmResult3Content || 'No third response' },
          ] as any,
        },
        async () => {
          await new Promise((r) => setTimeout(r, 300));
          return new SummarizeResponse({
            raw: { note: 'synthetic summarization output' },
            summary: 'Performed 3-loop interaction (weather, advisory, final summary).',
            newContext: [
              { role: 'system', content: 'Conversation summary context' },
              { role: 'tool', toolCallId: weatherToolCallId1, content: JSON.stringify(weather1) },
              { role: 'tool', toolCallId: advisoryToolCallId, content: JSON.stringify(advisory) },
              { role: 'ai', content: llmResult3Content ?? 'No final content' },
            ] as any,
          });
        },
      );
  });
}

main().catch(console.error);
