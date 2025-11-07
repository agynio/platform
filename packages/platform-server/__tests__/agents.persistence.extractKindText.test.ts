import { describe, it, expect, vi } from 'vitest';
// Mock Prisma client early to avoid generated client requirement
vi.mock('@prisma/client', () => ({
  MessageKind: { user: 'user', system: 'system', assistant: 'assistant', tool: 'tool' },
  RunStatus: { finished: 'finished', running: 'running', terminated: 'terminated' },
  RunMessageType: { input: 'input', output: 'output', injected: 'injected' },
  Prisma: { JsonNull: null },
}));
const { AgentsPersistenceService } = await import('../src/agents/agents.persistence.service');
const { LoggerService } = await import('../src/core/services/logger.service');
const { NoopGraphEventsPublisher } = await import('../src/gateway/graph.events.publisher');
import { AIMessage, HumanMessage, SystemMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import type { ResponseFunctionToolCall } from 'openai/resources/responses/responses.mjs';

function makeService(): InstanceType<typeof AgentsPersistenceService> {
  // Minimal stub; extractKindText does not use prisma
  const logger = new LoggerService();
  const metrics = { getThreadsMetrics: async () => ({}) } as any;
  const publisher = new NoopGraphEventsPublisher();
  return new AgentsPersistenceService({ getClient: () => ({}) } as any, logger, metrics, publisher as any);
}

// Duck-typing tests removed; service now accepts strictly typed messages only.

describe('AgentsPersistenceService beginRun/completeRun populates Message.text', () => {
  it('populates text for inputs and outputs', async () => {
    const createdMessages: any[] = [];
    const createdRunMessages: any[] = [];
    const runs: any[] = [];
    const prismaMock = {
      thread: {
        findUnique: async (_q: any) => ({ id: 'thread-1' }),
        create: async (_d: any) => ({ id: 'thread-1' }),
        updateMany: async (_args: any) => ({ count: 1 }),
      },
      run: {
        create: async ({ data }: any) => {
          const r = { id: 'run-1', ...data };
          runs.push(r);
          return r;
        },
        update: async ({ where, data }: any) => {
          const r = runs.find((x) => x.id === where.id);
          if (r) Object.assign(r, data);
          return r;
        },
      },
      message: {
        create: async ({ data }: any) => {
          const m = { id: `m${createdMessages.length + 1}` , ...data };
          createdMessages.push(m);
          return m;
        },
        findMany: async () => createdMessages,
      },
      runMessage: {
        create: async ({ data }: any) => {
          createdRunMessages.push(data);
          return data;
        },
      },
      $transaction: async (cb: any) => cb(prismaMock),
    } as any;

    const logger = new LoggerService();
    const metrics = { getThreadsMetrics: async () => ({}) } as any;
    const publisher = new NoopGraphEventsPublisher();
    const svc = new AgentsPersistenceService({ getClient: () => prismaMock } as any, logger, metrics, publisher as any);

    // Begin run with user + system messages
    const input = [HumanMessage.fromText('hello'), SystemMessage.fromText('sys')];
    const started = await svc.beginRunThread('thread-1', input);
    expect(started.runId).toBe('run-1');
    const inputs = createdMessages.filter((m) => createdRunMessages.find((r) => r.messageId === m.id && r.type === 'input'));
    expect(inputs.map((m) => m.text)).toEqual(['hello', 'sys']);

    // Complete run with assistant output and tool events
    const call = new ToolCallMessage({ type: 'function_call', call_id: 'c1', name: 'echo', arguments: '{"x":1}' } as ResponseFunctionToolCall);
    const out = AIMessage.fromText('done');
    const toolOut = ToolCallOutputMessage.fromResponse('c1', 'ok');
    await svc.completeRun(started.runId, 'finished' as any, [out, call, toolOut]);

    const outputs = createdMessages.filter((m) => createdRunMessages.find((r) => r.messageId === m.id && r.type === 'output'));
    expect(outputs.map((m) => m.text)).toEqual(['done', 'call echo({"x":1})', 'ok']);
  });
});
