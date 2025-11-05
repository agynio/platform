import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const RUN_MONGOMS = process.env.RUN_MONGOMS === '1';
import { startMemoryMongo } from './helpers/mongoMemory';
import { createServer } from '../src/server';

import { init, withAgent, withLLM, withToolCall, LLMResponse, HumanMessage, ToolCallMessage, SystemMessage, ToolCallResponse } from '../tracing/src';
import type { ResponseFunctionToolCall } from 'openai/resources/responses/responses.mjs';
import type { FastifyInstance } from 'fastify';

let mm: Awaited<ReturnType<typeof startMemoryMongo>>;
let server: FastifyInstance;
let baseUrl: string;

/**
 * NOTE: This currently EXPECTS failure of output attribute persistence because
 * the server does not merge completed span attributes (llm.content/output...).
 * Once merge logic is added, update expectations accordingly.
 */

describe.skipIf(!RUN_MONGOMS)('LLM span persistence end-to-end (real server + memory mongo)', () => {
  beforeAll(async () => {
    mm = await startMemoryMongo();
    server = await createServer(mm.db, { logger: false });
    await server.listen({ port: 0 });
    const addr = server.server.address();
    if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await server.close();
    await mm.stop();
  });

  it('persists completed LLM span with output content and toolCalls', async () => {
    init({ mode: 'extended', endpoints: { extended: baseUrl }, defaultAttributes: { service: 'e2e-app' } });
    const toolCallId = 'tc_e2e_1';
    await withAgent({ threadId: 't1', agentName: 'agent1' }, async () => {
        await withLLM({ context: [HumanMessage.fromText('Hello')] }, async () => {
          const tc: ResponseFunctionToolCall = { type: 'function_call', call_id: toolCallId, name: 'weather', arguments: JSON.stringify({ city: 'NYC' }) };
          return new LLMResponse({ raw: { text: 'Hi!' }, content: 'Hi! I will help you.', toolCalls: [new ToolCallMessage(tc)] });
        });
        await withToolCall({ toolCallId, name: 'weather', input: { city: 'NYC' } }, async () => {
          const result = { tempC: 21 };
          return new ToolCallResponse({ raw: result, output: result, status: 'success' });
        });
    });

    // Query DB directly
    const doc = await mm.db.collection('spans').findOne({ label: 'llm' });
    expect(doc).toBeTruthy();
    expect(doc?.completed).toBe(true);
    // Output object should be present with content + toolCalls
    expect(doc?.attributes?.output?.content).toBe('Hi! I will help you.');
    expect(Array.isArray(doc?.attributes?.output?.toolCalls)).toBe(true);
    expect(doc?.attributes?.output?.toolCalls?.[0]?.id).toBe(toolCallId);
  });
});
