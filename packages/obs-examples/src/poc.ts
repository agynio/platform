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
  SystemMessage,
  HumanMessage,
  ToolCallOutputMessage,
  ToolCallMessage,
} from '@agyn/tracing';
import { AIMessage, ResponseMessage } from '@agyn/tracing';

async function main() {
  const endpoint = process.env.TRACING_SERVER_URL || 'http://localhost:4319';
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

      // Build richContext properly using message classes
      const contextLoop1: Array<SystemMessage | HumanMessage | ResponseMessage | ToolCallOutputMessage> = [
        SystemMessage.fromText('You are a helpful assistant specializing in weather and reminders.'),
        HumanMessage.fromText('Hi assistant!'),
        new ResponseMessage({ output: [AIMessage.fromText('Hello! How can I help you today?').toPlain()] }),
        HumanMessage.fromText('What is the weather in NYC?'),
        SystemMessage.fromText('Ensure responses are concise.'),
        HumanMessage.fromText('Also, set a reminder to check humidity.'),
        new ResponseMessage({ output: [AIMessage.fromText('I can fetch the weather and set a reminder. One moment.').toPlain()] }),
        ToolCallOutputMessage.fromResponse('memory_lookup_1', 'No prior weather queries stored.'),
        HumanMessage.fromText('Add Brooklyn specifically.'),
        new ResponseMessage({ output: [AIMessage.fromText('Got it. Will include Brooklyn specifics.').toPlain()] }),
        HumanMessage.fromText('And include temperature in Celsius.'),
        SystemMessage.fromText('Do not include sensitive data.'),
        HumanMessage.fromText('What about sunrise time?'),
        new ResponseMessage({ output: [AIMessage.fromText('I will retrieve current conditions and sunrise time.').toPlain()] }),
        SystemMessage.fromText(
          'Formatting Guidelines:\n- Provide temperature in Celsius and Fahrenheit\n- Include sunrise and sunset on separate lines\n- If UV index > 7, add a caution line\n- Keep overall response under 120 words',
        ),
        HumanMessage.fromText(
          'Actually, could you also:\n1. Show humidity\n2. Show wind speed\n3. Provide a short recommendation about clothing\n4. Repeat the city name at the top\nThanks!',
        ),
        new ResponseMessage({ output: [AIMessage.fromText('Plan:\n- Fetch base weather (temp, humidity, wind)\n- Fetch astronomical data (sunrise/sunset)\n- Derive clothing recommendation from temperature + wind chill\n- Check UV index for safety notice\nProceeding with tool calls...').toPlain()] }),
        HumanMessage.fromText(
          '# Detailed Weather Report Request\n\nPlease include:\n\n## Sections\n- **Current Conditions**\n- **Astronomy** (sunrise/sunset)\n- **Advisories** (UV, wind)\n\n## Format\n1. Start with a title line.\n2. Provide a bullet list summary.\n3. Add a short code block showing JSON of raw key metrics.\n\n```json\n{ "want": ["tempC", "tempF", "humidity", "windKph" ] }\n```\n\nThanks!',
        ),
        new ResponseMessage({ output: [AIMessage.fromText('Acknowledged. I will structure the response as requested.\n\n```pseudo\nsteps = [\n  "gather_weather()",\n  "compute_advisories()",\n  "format_markdown()"\n]\n```').toPlain()] }),
        ToolCallOutputMessage.fromResponse(
          'weather_source_prefetch',
          'Prefetch complete: sources=[noaa, open-meteo]\nlat=40.7128 lon=-74.0060',
        ),
        ToolCallOutputMessage.fromResponse('prior_summary_1', 'Previous summary: greeting only.'),
        HumanMessage.fromText('Thanks!'),
        new ResponseMessage({ output: [AIMessage.fromText('You are welcome. Proceeding with weather lookup.').toPlain()] }),
        HumanMessage.fromText('Can you also estimate UV index?'),
        SystemMessage.fromText('If multiple tool calls needed, batch them.'),
        HumanMessage.fromText('Let me know if you need clarification.'),
      ];

      let llmResult1Content: string | undefined;
      const llmResult1 = await withLLM({ context: contextLoop1 }, async () => {
        await new Promise((r) => setTimeout(r, 800));
        const raw = { text: 'Initial weather request acknowledged.' };
        const resp = new LLMResponse({
          raw,
          content: 'I will look up the weather for NYC including Brooklyn details.',
          toolCalls: [],
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
            SystemMessage.fromText('You are an assistant generating human-friendly advisories.'),
            HumanMessage.fromText('Provide clothing and UV advice given current conditions.'),
            ToolCallOutputMessage.fromResponse(weatherToolCallId1, JSON.stringify(weather1)),
          ],
        },
        async () => {
          await new Promise((r) => setTimeout(r, 600));
          const resp = new LLMResponse({
            raw: { text: 'Computing advisories.' },
            content: 'Based on current conditions I will compute advisory.',
            toolCalls: [],
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
              SystemMessage.fromText('Assistant deciding whether to invoke unreliable tool.'),
              HumanMessage.fromText('Please run the unreliable step.'),
            ],
          },
          async () => {
            return new LLMResponse({ raw: { text: 'About to invoke failing tool.' }, content: 'Attempting failing tool call now.', toolCalls: [] });
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
            SystemMessage.fromText('Assistant planning an explicit error tool call.'),
            HumanMessage.fromText('Invoke the checker tool even if it will report an error.'),
          ],
        },
        async () =>
          new LLMResponse({
            raw: { text: 'Preparing explicit error tool call' },
            content: 'Calling checker tool which will return an error structure.',
            toolCalls: [],
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
            SystemMessage.fromText('You are a summarizer.'),
            ToolCallOutputMessage.fromResponse(weatherToolCallId1, JSON.stringify(weather1)),
            ToolCallOutputMessage.fromResponse(advisoryToolCallId, JSON.stringify(advisory)),
            ToolCallOutputMessage.fromResponse('tc_fail_demo_1', 'Tool failed intentionally (no output).'),
            HumanMessage.fromText('Provide a concise final weather + advisory summary.'),
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
            SystemMessage.fromText('Conversation recap preparation.'),
            new ResponseMessage({ output: [AIMessage.fromText(llmResult1Content || 'No first response').toPlain()] }),
            ToolCallOutputMessage.fromResponse(weatherToolCallId1, JSON.stringify(weather1)),
            new ResponseMessage({ output: [AIMessage.fromText(llmResult2Content || 'No second response').toPlain()] }),
            ToolCallOutputMessage.fromResponse(advisoryToolCallId, JSON.stringify(advisory)),
            new ResponseMessage({ output: [AIMessage.fromText(llmResult3Content || 'No third response').toPlain()] }),
          ],
        },
        async () => {
          await new Promise((r) => setTimeout(r, 300));
          return new SummarizeResponse({
            raw: { note: 'synthetic summarization output' },
            summary: 'Performed 3-loop interaction (weather, advisory, final summary).',
            newContext: [
              SystemMessage.fromText('Conversation summary context'),
              ToolCallOutputMessage.fromResponse(weatherToolCallId1, JSON.stringify(weather1)),
              ToolCallOutputMessage.fromResponse(advisoryToolCallId, JSON.stringify(advisory)),
              new ResponseMessage({ output: [AIMessage.fromText(llmResult3Content ?? 'No final content').toPlain()] }),
            ],
          });
        },
      );
  });
}

main().catch(console.error);
