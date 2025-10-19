import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const RUN_MONGOMS = process.env.RUN_MONGOMS === '1';
import { startMemoryMongo } from './helpers/mongoMemory';
import { createServer } from '../src/server';

import * as sdk from '../../tracing';
const { init, withAgent, withToolCall, ToolCallResponse } = sdk as any;
import type { FastifyInstance } from 'fastify';

let mm: Awaited<ReturnType<typeof startMemoryMongo>>;
let server: FastifyInstance;
let baseUrl: string;

/**
 * End-to-end persistence test focused on the tool_call span itself.
 * Ensures that the tool call output returned via ToolCallResponse is merged
 * into the persisted span document under attributes.output.
 */
describe.skipIf(!RUN_MONGOMS)('ToolCall span persistence end-to-end (real server + memory mongo)', () => {
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

  it('persists completed tool_call span with output object', async () => {
    init({ mode: 'extended', endpoints: { extended: baseUrl }, defaultAttributes: { service: 'e2e-app' } });
    const toolCallId = 'tc_tool_output_1';
    const toolName = 'demoTool';
    const input = { value: 42 };
    const toolOutput = { answer: 84, meta: { doubled: true } };

    await withAgent({ threadId: 't_tool', agentName: 'agentTool' }, async () => {
        await withToolCall({ toolCallId, name: toolName, input }, async () => {
          return new ToolCallResponse({ raw: toolOutput, output: toolOutput, status: 'success' });
        });
    });

    // Query DB directly for the tool_call span (label pattern: tool:<name>)
    const doc = await mm.db.collection('spans').findOne({ label: `tool:${toolName}` });
    expect(doc).toBeTruthy();
    expect(doc?.completed).toBe(true);
    // Basic identifying attributes
    expect(doc?.attributes?.toolCallId).toBe(toolCallId);
    expect(doc?.attributes?.name).toBe(toolName);
    expect(doc?.attributes?.input).toEqual(input);
    // Output persisted (instrumentation sets attributes.output = result.output)
    expect(doc?.attributes?.output).toEqual(toolOutput);
  });
});
