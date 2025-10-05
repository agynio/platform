import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { init, withThread, withAgent, withLLM, withToolCall, LLMResponse } from '../src';

let server: http.Server;
let port: number;
const spanEvents: any[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url?.includes('/v1/spans/upsert')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try { spanEvents.push(JSON.parse(body)); } catch {}
        res.statusCode = 200;
        res.end('ok');
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) =>
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') port = addr.port;
      resolve();
    }),
  );
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('obs-sdk LLM span attributes (e2e)', () => {
  it('captures completed LLM span with output content and toolCalls', async () => {
    init({
      mode: 'extended',
      endpoints: { extended: `http://localhost:${port}` },
      defaultAttributes: { service: 'obs-sdk' },
    });
    const toolCallId = 'tc_obs_sdk_1';
    await withThread({ threadId: 'obs-thread' }, async () => {
      await withAgent({ agentName: 'obs-agent' }, async () => {
        await withLLM({ context: [{ role: 'human', content: 'Ping' }] as any }, async () => {
          const raw = { text: 'Pong!' };
          return new LLMResponse({
            raw,
            content: 'Pong!',
            toolCalls: [{ id: toolCallId, name: 'weather', arguments: { city: 'LA' } }],
          });
        });
        await withToolCall({ toolCallId, name: 'weather', input: { city: 'LA' } }, async () => ({ tempC: 25 }));
      });
    });

    // Allow async HTTP posts (await inside withSpan already awaited, but network scheduling might lag)
    for (let i = 0; i < 5; i++) {
      if (spanEvents.find((e) => e.label === 'llm' && e.state === 'completed')) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    // eslint-disable-next-line no-console
    console.log('Captured events count', spanEvents.length, spanEvents.map(e => e.state+':'+e.label));

    const completed = spanEvents.find((e) => e.label === 'llm' && e.state === 'completed');
    expect(completed).toBeTruthy();
    expect(completed.attributes.service).toBe('obs-sdk');
    expect(Array.isArray(completed.attributes.context)).toBe(true);
    expect(completed.attributes.output?.content).toBe('Pong!');
    expect(Array.isArray(completed.attributes.output?.toolCalls)).toBe(true);
    expect(completed.attributes.output.toolCalls[0].id).toBe(toolCallId);
  });
});
